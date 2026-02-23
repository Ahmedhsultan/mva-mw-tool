import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  addDoc,
  deleteDoc,
  doc,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Reservation } from '../models/reservation.model';

@Injectable({
  providedIn: 'root',
})
export class ReservationService {
  private firestore = inject(Firestore);
  private collectionRef = collection(this.firestore, 'reservations');

  /** Stream all reservations (sorted client-side to avoid index requirement) */
  getReservations$(): Observable<Reservation[]> {
    return (collectionData(this.collectionRef, { idField: 'id' }) as Observable<Reservation[]>).pipe(
      map((items) => items.sort((a, b) => a.startDate.localeCompare(b.startDate)))
    );
  }

  /** Add a new reservation */
  async addReservation(reservation: Omit<Reservation, 'id'>): Promise<void> {
    await addDoc(this.collectionRef, { ...reservation });
  }

  /** Delete a reservation by ID */
  async deleteReservation(id: string): Promise<void> {
    const docRef = doc(this.firestore, 'reservations', id);
    await deleteDoc(docRef);
  }
}
