import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, firstValueFrom, filter, switchMap } from 'rxjs';
import {
  Reservation,
  ENVIRONMENTS,
} from '../../models/reservation.model';
import { ReservationService } from '../../services/reservation.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-environment-reservation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './environment-reservation.component.html',
  styleUrl: './environment-reservation.component.css',
})
export class EnvironmentReservationComponent implements OnInit, OnDestroy {
  environments = ENVIRONMENTS;
  reservations: Reservation[] = [];
  loadingReservations = true;
  private sub!: Subscription;

  // Calendar state
  weekStart!: Date;
  weekDates: Date[] = [];

  // Reservation form modal
  showModal = false;
  modalEnv = '';
  modalDate = '';
  userName = '';
  endDate = '';
  errorMessage = '';
  successMessage = '';
  isSubmitting = false;

  // Tooltip / selected reservation
  selectedReservation: Reservation | null = null;

  // Edit mode
  isEditing = false;
  editName = '';
  editStartDate = '';
  editEndDate = '';
  editError = '';
  isSaving = false;

  constructor(
    private reservationService: ReservationService,
    private authService: AuthService
  ) {
    this.setWeekFromDate(new Date());
  }

  ngOnInit(): void {
    // Wait for auth to be ready, then subscribe to reservations
    this.sub = this.authService.user$.pipe(
      filter((user) => user !== null),
      switchMap(() => this.reservationService.getReservations$())
    ).subscribe(
      (reservations) => {
        this.reservations = reservations;
        this.loadingReservations = false;
      }
    );
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Set the week starting from Monday of the given date */
  setWeekFromDate(date: Date): void {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    this.weekStart = new Date(d.setDate(diff));
    this.weekStart.setHours(0, 0, 0, 0);
    this.buildWeekDates();
  }

  buildWeekDates(): void {
    this.weekDates = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(this.weekStart);
      d.setDate(d.getDate() + i);
      this.weekDates.push(d);
    }
  }

  prevWeek(): void {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() - 7);
    this.setWeekFromDate(d);
  }

  nextWeek(): void {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() + 7);
    this.setWeekFromDate(d);
  }

  goToToday(): void {
    this.setWeekFromDate(new Date());
  }

  /** Get reservation for a specific env+date cell */
  getReservation(env: string, date: Date): Reservation | null {
    const dateStr = this.toDateString(date);
    return (
      this.reservations.find((r) => {
        if (r.environment !== env) return false;
        return dateStr >= r.startDate && dateStr <= r.endDate;
      }) ?? null
    );
  }

  /** Check if this date is the start of a reservation span */
  isSpanStart(env: string, date: Date): boolean {
    const r = this.getReservation(env, date);
    if (!r) return false;
    const dateStr = this.toDateString(date);
    if (dateStr === r.startDate) return true;
    if (this.weekDates.length > 0) {
      const firstVisible = this.toDateString(this.weekDates[0]);
      return dateStr === firstVisible && r.startDate < firstVisible;
    }
    return false;
  }

  /** Check if a cell is part of a span but NOT the start */
  isSpanContinuation(env: string, date: Date): boolean {
    const r = this.getReservation(env, date);
    if (!r) return false;
    return !this.isSpanStart(env, date);
  }

  /** Calculate colspan for a reservation starting at this date */
  getColspan(env: string, date: Date): number {
    const r = this.getReservation(env, date);
    if (!r) return 1;
    const startIdx = this.weekDates.findIndex(
      (d) => this.toDateString(d) === this.toDateString(date)
    );
    let count = 0;
    for (let i = startIdx; i < this.weekDates.length; i++) {
      const ds = this.toDateString(this.weekDates[i]);
      if (ds >= r.startDate && ds <= r.endDate) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /** Click on empty cell to open reservation modal */
  openReserveModal(env: string, date: Date): void {
    this.modalEnv = env;
    this.modalDate = this.toDateString(date);
    this.endDate = this.toDateString(date);
    this.userName = '';
    this.errorMessage = '';
    this.successMessage = '';
    this.selectedReservation = null;
    this.showModal = true;
  }

  /** Click on reserved cell to show details */
  selectReservation(reservation: Reservation): void {
    this.selectedReservation = reservation;
    this.showModal = false;
  }

  closeModal(): void {
    this.showModal = false;
    this.errorMessage = '';
    this.successMessage = '';
  }

  closeDetails(): void {
    this.selectedReservation = null;
    this.isEditing = false;
    this.editError = '';
  }

  openEdit(): void {
    if (!this.selectedReservation) return;
    this.editName = this.selectedReservation.userName;
    this.editStartDate = this.selectedReservation.startDate;
    this.editEndDate = this.selectedReservation.endDate;
    this.editError = '';
    this.isEditing = true;
  }

  cancelEdit(): void {
    this.isEditing = false;
    this.editError = '';
  }

  async saveEdit(): Promise<void> {
    if (!this.selectedReservation) return;
    this.editError = '';
    if (!this.editName.trim()) { this.editError = 'Name is required.'; return; }
    if (!this.editStartDate || !this.editEndDate) { this.editError = 'Both dates are required.'; return; }
    if (this.editStartDate > this.editEndDate) { this.editError = 'End date must be on or after start date.'; return; }
    // Check for conflicts with other reservations
    const conflict = this.reservations.find((r) => {
      if (r.id === this.selectedReservation!.id) return false;
      if (r.environment !== this.selectedReservation!.environment) return false;
      return this.editStartDate <= r.endDate && this.editEndDate >= r.startDate;
    });
    if (conflict) { this.editError = `Conflicts with "${conflict.userName}" (${conflict.startDate} → ${conflict.endDate}).`; return; }
    this.isSaving = true;
    try {
      await this.reservationService.updateReservation(this.selectedReservation.id, {
        userName: this.editName.trim(),
        startDate: this.editStartDate,
        endDate: this.editEndDate,
      });
      this.isEditing = false;
    } catch (err: any) {
      this.editError = `Failed to save: ${err?.message || String(err)}`;
    } finally {
      this.isSaving = false;
    }
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.userName || !this.endDate) {
      this.errorMessage = 'Please fill in all fields.';
      return;
    }

    if (new Date(this.modalDate) > new Date(this.endDate)) {
      this.errorMessage = 'End date must be on or after start date.';
      return;
    }

    // Check for conflicts using current snapshot
    const conflict = this.reservations.find((r) => {
      if (r.environment !== this.modalEnv) return false;
      return this.modalDate <= r.endDate && this.endDate >= r.startDate;
    });

    if (conflict) {
      this.errorMessage = `Already reserved by "${conflict.userName}" (${conflict.startDate} → ${conflict.endDate}).`;
      return;
    }

    this.isSubmitting = true;
    try {
      await this.reservationService.addReservation({
        userName: this.userName,
        environment: this.modalEnv,
        startDate: this.modalDate,
        endDate: this.endDate,
      });
      this.showModal = false;
    } catch (err: any) {
      console.error('Firebase reservation error:', err);
      const msg = err?.message || err?.code || String(err);
      if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
        this.errorMessage = 'Permission denied. Make sure Firestore is in test mode (Firebase Console → Firestore → Rules).';
      } else if (msg.includes('NOT_FOUND') || msg.includes('not found')) {
        this.errorMessage = 'Firestore database not found. Create it in Firebase Console → Firestore Database → Create database.';
      } else {
        this.errorMessage = `Failed to save: ${msg}`;
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  async deleteReservation(id: string): Promise<void> {
    try {
      await this.reservationService.deleteReservation(id);
      this.selectedReservation = null;
    } catch (err) {
      // Reservation list will auto-update via the subscription
    }
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return this.toDateString(date) === this.toDateString(today);
  }

  isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  formatDay(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatWeekRange(): string {
    const end = new Date(this.weekStart);
    end.setDate(end.getDate() + 13);
    return `${this.weekStart.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })} – ${end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }

  toDateString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
