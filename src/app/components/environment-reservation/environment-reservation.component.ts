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
import { AzureDevOpsService } from '../../services/azure-devops.service';

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

  // PAT config
  showPatModal = false;
  patInput = '';
  patTeam = 'MVA-Nubia';
  patConfigured = false;
  patValidating = false;
  patError = '';

  constructor(
    private reservationService: ReservationService,
    private authService: AuthService,
    private azureDevOps: AzureDevOpsService
  ) {
    this.setWeekFromDate(new Date());
  }

  // Sprint / PI label map for prod1-blue
  sprintLabelMap: Map<string, string> = new Map();
  private sprintIterations: { name: string; path: string; startDate: string; finishDate: string }[] = [];

  openPatModal(): void {
    this.patInput = '';
    this.patError = '';
    // Restore saved team name if available
    const savedTeam = localStorage.getItem('azure-sprint-team');
    if (savedTeam) this.patTeam = savedTeam;
    this.showPatModal = true;
  }

  closePatModal(): void {
    this.showPatModal = false;
    this.patInput = '';
    this.patError = '';
  }

  async savePat(): Promise<void> {
    if (!this.patInput.trim()) return;
    this.patValidating = true;
    this.patError = '';
    this.azureDevOps.configure({
      pat: this.patInput.trim(),
      organization: 'vfuk-digital',
      project: 'Digital',
    });
    try {
      const result = await this.azureDevOps.validatePat();
      if (result.success) {
        this.azureDevOps.persistConfig();
        localStorage.setItem('azure-sprint-team', this.patTeam.trim());
        this.patConfigured = true;
        this.showPatModal = false;
        this.patInput = '';
        this.loadSprintData();
      } else {
        this.patError = result.message || 'Invalid PAT';
      }
    } catch (e: any) {
      this.patError = e.message || 'Validation failed';
    }
    this.patValidating = false;
  }

  disconnectPat(): void {
    localStorage.removeItem('azure-devops-config');
    localStorage.removeItem('azure-sprint-team');
    this.patConfigured = false;
    this.sprintLabelMap.clear();
    this.sprintIterations = [];
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
    // Check if PAT is already configured
    this.patConfigured = this.azureDevOps.isConfigured() || this.azureDevOps.restoreConfig();
    // Load sprint data from Azure DevOps if PAT is configured
    this.loadSprintData();
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
    // Rebuild sprint labels for new visible dates
    if (this.sprintIterations.length > 0) {
      this.buildSprintLabels();
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
    return day === 5 || day === 6; // Friday + Saturday
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

  // ── Sprint / PI label helpers ─────────────────────────────────

  async loadSprintData(): Promise<void> {
    if (!this.azureDevOps.isConfigured()) {
      this.azureDevOps.restoreConfig();
    }
    if (!this.azureDevOps.isConfigured()) {
      console.warn('[SprintLabels] Azure DevOps not configured, skipping sprint labels');
      return;
    }

    try {
      const team = localStorage.getItem('azure-sprint-team') || this.patTeam;
      this.sprintIterations = await this.azureDevOps.getAllIterations(team);
      console.log('[SprintLabels] Loaded iterations:', this.sprintIterations.length, this.sprintIterations.slice(0, 3));
    } catch (e) {
      console.error('[SprintLabels] Failed to load iterations:', e);
    }
    this.buildSprintLabels();
    console.log('[SprintLabels] Label map size:', this.sprintLabelMap.size, Object.fromEntries(this.sprintLabelMap));
  }

  /** Rebuild the sprint label map for all visible dates */
  private buildSprintLabels(): void {
    this.sprintLabelMap.clear();
    for (const date of this.weekDates) {
      const label = this.computeSprintLabel(date);
      if (label) {
        this.sprintLabelMap.set(this.toDateString(date), label);
      }
    }
  }

  /**
   * Compute the label: PI.Sprint.SprintWeek.DayOfWeek
   * Iteration names are expected to follow pattern like "PI 25.1\\Sprint 1" or "PI25.1\\Sprint 2"
   * Parses PI number, sprint number, calculates the week within the sprint,
   * and day-of-week (1=Mon..5=Fri).
   */
  private computeSprintLabel(date: Date): string {
    const dateStr = this.toDateString(date);
    const dayOfWeek = date.getDay(); // 0=Sun..6=Sat
    if (dayOfWeek === 5 || dayOfWeek === 6) return ''; // skip Fri+Sat weekends

    // Map Sun-Thu to work day 1-5 (Sun=1, Mon=2, Tue=3, Wed=4, Thu=5)
    const workDay = dayOfWeek === 0 ? 1 : dayOfWeek + 1;

    // Find the iteration that contains this date
    const iteration = this.sprintIterations.find(
      (it) => dateStr >= it.startDate && dateStr <= it.finishDate
    );
    if (!iteration) return '';

    // Use iteration name directly, append week and work day
    // Calculate sprint week: how many weeks into the sprint is this date?
    const sprintStart = new Date(iteration.startDate + 'T00:00:00');
    const dayDiff = Math.floor((date.getTime() - sprintStart.getTime()) / (1000 * 60 * 60 * 24));
    const sprintWeek = Math.floor(dayDiff / 7) + 1;

    return `BAU ${iteration.name}.${sprintWeek}.${workDay}`;
  }

  /** Get the sprint label for a specific date (used in template) */
  getSprintLabel(date: Date): string {
    return this.sprintLabelMap.get(this.toDateString(date)) || '';
  }
}
