import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reservation } from '../models/reservation.model';
import { JsonDbService } from './json-db.service';

const RESERVATIONS_FILE = '/db/reservations.json';
const CACHE_KEY = 'mva_reservations_cache';

@Injectable({
  providedIn: 'root',
})
export class ReservationService {
  private jsonDb = inject(JsonDbService);
  private reservationsSubject = new BehaviorSubject<Reservation[]>(this.loadFromCache());

  /** Stream all reservations (sorted by start date) */
  getReservations$(): Observable<Reservation[]> {
    // Trigger a fresh load from the repo
    this.loadFromRepo();
    return this.reservationsSubject.asObservable().pipe(
      map((items) => items.sort((a, b) => a.startDate.localeCompare(b.startDate)))
    );
  }

  /** Force refresh from the repo */
  async refresh(): Promise<void> {
    await this.loadFromRepo();
  }

  /** Add a new reservation */
  async addReservation(reservation: Omit<Reservation, 'id'>): Promise<void> {
    const reservations = await this.readLatest();
    const newReservation: Reservation = {
      ...reservation,
      id: crypto.randomUUID(),
    };
    reservations.push(newReservation);
    await this.saveAll(reservations);
  }

  /** Update an existing reservation */
  async updateReservation(id: string, changes: Partial<Omit<Reservation, 'id'>>): Promise<void> {
    const reservations = await this.readLatest();
    const idx = reservations.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error('Reservation not found');
    reservations[idx] = { ...reservations[idx], ...changes };
    await this.saveAll(reservations);
  }

  /** Delete a reservation by ID */
  async deleteReservation(id: string): Promise<void> {
    const reservations = await this.readLatest();
    const filtered = reservations.filter((r) => r.id !== id);
    await this.saveAll(filtered);
  }

  // ── Private helpers ────────────────────────────────────────

  /** Read the latest data from the repo (or cache if repo unavailable) */
  private async readLatest(): Promise<Reservation[]> {
    const data = await this.jsonDb.readFile<Reservation[]>(RESERVATIONS_FILE);
    if (data) {
      this.reservationsSubject.next(data);
      this.saveToCache(data);
      return [...data];
    }
    return [...this.reservationsSubject.value];
  }

  /** Save the full list to repo and update local state */
  private async saveAll(reservations: Reservation[]): Promise<void> {
    // Update local state immediately for responsive UI
    this.reservationsSubject.next(reservations);
    this.saveToCache(reservations);
    // Push to repo
    await this.jsonDb.writeFile(RESERVATIONS_FILE, reservations, 'Update reservations');
  }

  /** Load reservations from the git repo or local asset */
  private async loadFromRepo(): Promise<void> {
    try {
      let data = await this.jsonDb.readFile<Reservation[]>(RESERVATIONS_FILE);
      // If no PAT or repo read failed, fall back to the local static asset
      if (!data) {
        data = await this.fetchLocalAsset();
      }
      if (data) {
        this.reservationsSubject.next(data);
        this.saveToCache(data);
      }
    } catch (err) {
      console.warn('Failed to load reservations from repo:', err);
      // Last resort: local asset
      try {
        const data = await this.fetchLocalAsset();
        if (data) {
          this.reservationsSubject.next(data);
          this.saveToCache(data);
        }
      } catch { /* use cache */ }
    }
  }

  /** Fetch reservations from the local static asset */
  private async fetchLocalAsset(): Promise<Reservation[] | null> {
    try {
      const res = await fetch('/db/reservations.json');
      if (res.ok) return res.json();
    } catch { /* not available */ }
    return null;
  }

  /** Load from localStorage cache */
  private loadFromCache(): Reservation[] {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /** Save to localStorage cache */
  private saveToCache(data: Reservation[]): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      // localStorage full or unavailable
    }
  }
}
