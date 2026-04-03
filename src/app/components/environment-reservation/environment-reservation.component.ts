import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';

import { Reservation, ENVIRONMENTS, SERVICE_META, getServiceAbbr, getServiceColor } from '../../models/reservation.model';
import { ReservationService } from '../../services/reservation.service';
import { AuthService } from '../../services/auth.service';
import { AzureDevOpsService } from '../../services/azure-devops.service';
import { SettingsService } from '../../services/settings.service';
import {
  toDateString,
  isToday as dateIsToday,
  getWeekStart,
  buildDateRange,
  shiftDays,
  formatDay as dateFmtDay,
  formatShortDate,
  formatFullDate,
  dateRangesOverlap,
} from '../../utils/date.utils';

// ── Sprint Iteration Shape ───────────────────────────────────
interface SprintIteration {
  name: string;
  path: string;
  startDate: string;
  finishDate: string;
}

@Component({
  selector: 'app-environment-reservation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './environment-reservation.component.html',
  styleUrl: './environment-reservation.component.css',
})
export class EnvironmentReservationComponent implements OnInit {
  // ── Injected Dependencies ────────────────────────────────
  private readonly destroyRef = inject(DestroyRef);
  private readonly settingsService = inject(SettingsService);
  private readonly reservationService = inject(ReservationService);
  private readonly authService = inject(AuthService);
  private readonly azureDevOps = inject(AzureDevOpsService);

  // ── Calendar State ───────────────────────────────────────
  environments: readonly string[] = ENVIRONMENTS;
  weekStart!: Date;
  weekDates: Date[] = [];

  // ── Reservations ─────────────────────────────────────────
  reservations: Reservation[] = [];
  loadingReservations = true;

  // ── Service Metadata ─────────────────────────────────────
  serviceMeta = SERVICE_META;
  allServices: string[] = [];

  // ── Reserve Modal State ──────────────────────────────────
  showModal = false;
  modalEnv = '';
  modalDate = '';
  userName = '';
  selectedServices: string[] = [];
  endDate = '';
  errorMessage = '';
  successMessage = '';
  isSubmitting = false;

  // ── Reservation Detail / Edit ────────────────────────────
  selectedReservation: Reservation | null = null;
  isEditing = false;
  editName = '';
  editSelectedServices: string[] = [];
  editStartDate = '';
  editEndDate = '';
  editError = '';
  isSaving = false;

  // ── PAT / Sprint Config ──────────────────────────────────
  showPatModal = false;
  patInput = '';
  patTeam = 'MVA-Nubia';
  patConfigured = false;
  patValidating = false;
  patError = '';

  // ── Sprint Label Map ─────────────────────────────────────
  sprintLabelMap = new Map<string, string>();
  private sprintIterations: SprintIteration[] = [];

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  constructor() {
    this.initWeek(new Date());
  }

  ngOnInit(): void {
    this.subscribeToSettings();
    this.subscribeToReservations();
    this.initPatConfig();
  }

  // ─────────────────────────────────────────────────────────
  // Subscription Setup (auto-cleaned via DestroyRef)
  // ─────────────────────────────────────────────────────────

  private subscribeToSettings(): void {
    this.allServices = this.settingsService.servicesOnly;
    this.settingsService.servicesOnly$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((s) => (this.allServices = s));

    this.environments = this.settingsService.envsReservation;
    this.settingsService.envsReservation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => (this.environments = e));
  }

  private subscribeToReservations(): void {
    this.authService.user$
      .pipe(
        filter((user) => user !== null),
        switchMap(() => this.reservationService.getReservations$()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((reservations) => {
        this.reservations = reservations;
        this.loadingReservations = false;
      });
  }

  private initPatConfig(): void {
    this.patConfigured = this.azureDevOps.isConfigured() || this.azureDevOps.restoreConfig();
    this.loadSprintData();

    this.settingsService.patConfig$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cfg) => {
        if (cfg && !this.patConfigured) {
          this.azureDevOps.configure(cfg);
          this.patConfigured = true;
          this.loadSprintData();
        }
      });
  }

  // ─────────────────────────────────────────────────────────
  // Calendar Navigation
  // ─────────────────────────────────────────────────────────

  private initWeek(date: Date): void {
    this.weekStart = getWeekStart(date);
    this.rebuildWeekDates();
  }

  private rebuildWeekDates(): void {
    this.weekDates = buildDateRange(this.weekStart, 14);
    if (this.sprintIterations.length > 0) {
      this.buildSprintLabels();
    }
  }

  prevWeek(): void {
    this.weekStart = getWeekStart(shiftDays(this.weekStart, -7));
    this.rebuildWeekDates();
  }

  nextWeek(): void {
    this.weekStart = getWeekStart(shiftDays(this.weekStart, 7));
    this.rebuildWeekDates();
  }

  goToToday(): void {
    this.initWeek(new Date());
  }

  // ─────────────────────────────────────────────────────────
  // Reservation Queries
  // ─────────────────────────────────────────────────────────

  getReservations(env: string, date: Date): Reservation[] {
    const dateStr = toDateString(date);
    return this.reservations.filter(
      (r) => r.environment === env && dateStr >= r.startDate && dateStr <= r.endDate,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Service Selection (shared between create & edit forms)
  // ─────────────────────────────────────────────────────────

  toggleService(svc: string): void {
    toggleInArray(this.selectedServices, svc);
  }

  isServiceSelected(svc: string): boolean {
    return this.selectedServices.includes(svc);
  }

  toggleEditService(svc: string): void {
    toggleInArray(this.editSelectedServices, svc);
  }

  isEditServiceSelected(svc: string): boolean {
    return this.editSelectedServices.includes(svc);
  }

  // ─────────────────────────────────────────────────────────
  // Service Metadata Accessors (delegated to model helpers)
  // ─────────────────────────────────────────────────────────

  getServiceAbbr(svc: string): string {
    return getServiceAbbr(svc);
  }

  getServiceColor(svc: string): string {
    return getServiceColor(svc);
  }

  getBarTint(reservation: Reservation): string {
    const svcs = reservation.services ?? [];
    if (svcs.length === 0) return '#f8fafc';
    return getServiceColor(svcs[0]) + '12';
  }

  getBarBorder(reservation: Reservation): string {
    const svcs = reservation.services ?? [];
    return svcs.length === 0 ? '#e2e8f0' : getServiceColor(svcs[0]);
  }

  // ─────────────────────────────────────────────────────────
  // Reserve Modal
  // ─────────────────────────────────────────────────────────

  openReserveModal(env: string, date: Date): void {
    this.modalEnv = env;
    this.modalDate = toDateString(date);
    this.endDate = toDateString(date);
    this.userName = '';
    this.selectedServices = [];
    this.errorMessage = '';
    this.successMessage = '';
    this.selectedReservation = null;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.errorMessage = '';
    this.successMessage = '';
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.userName || !this.endDate) {
      this.errorMessage = 'Please fill in all fields.';
      return;
    }
    if (this.selectedServices.length === 0) {
      this.errorMessage = 'Please select at least one service.';
      return;
    }
    if (this.modalDate > this.endDate) {
      this.errorMessage = 'End date must be on or after start date.';
      return;
    }

    const conflict = this.findConflict(this.modalEnv, this.modalDate, this.endDate, this.selectedServices);
    if (conflict) {
      this.errorMessage = conflict;
      return;
    }

    this.isSubmitting = true;
    try {
      await this.reservationService.addReservation({
        userName: this.userName,
        services: [...this.selectedServices],
        environment: this.modalEnv,
        startDate: this.modalDate,
        endDate: this.endDate,
      });
      this.showModal = false;
    } catch (err: any) {
      this.errorMessage = this.formatFirebaseError(err);
    } finally {
      this.isSubmitting = false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Reservation Details / Edit
  // ─────────────────────────────────────────────────────────

  selectReservation(reservation: Reservation): void {
    this.selectedReservation = reservation;
    this.showModal = false;
  }

  closeDetails(): void {
    this.selectedReservation = null;
    this.isEditing = false;
    this.editError = '';
  }

  openEdit(): void {
    if (!this.selectedReservation) return;
    this.editName = this.selectedReservation.userName;
    this.editSelectedServices = [...(this.selectedReservation.services ?? [])];
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

    const conflict = this.findConflict(
      this.selectedReservation.environment,
      this.editStartDate,
      this.editEndDate,
      this.editSelectedServices,
      this.selectedReservation.id,
    );
    if (conflict) { this.editError = conflict; return; }

    this.isSaving = true;
    try {
      await this.reservationService.updateReservation(this.selectedReservation.id, {
        userName: this.editName.trim(),
        services: [...this.editSelectedServices],
        startDate: this.editStartDate,
        endDate: this.editEndDate,
      });
      this.isEditing = false;
    } catch (err: any) {
      this.editError = `Failed to save: ${err?.message ?? String(err)}`;
    } finally {
      this.isSaving = false;
    }
  }

  async deleteReservation(id: string): Promise<void> {
    try {
      await this.reservationService.deleteReservation(id);
      this.selectedReservation = null;
    } catch {
      // Reservation list auto-updates via Firestore subscription
    }
  }

  // ─────────────────────────────────────────────────────────
  // PAT Modal
  // ─────────────────────────────────────────────────────────

  openPatModal(): void {
    this.patInput = '';
    this.patError = '';
    const savedTeam = this.settingsService.sprintTeam;
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
        this.settingsService.saveSprintTeam(this.patTeam.trim());
        this.patConfigured = true;
        this.showPatModal = false;
        this.patInput = '';
        this.loadSprintData();
      } else {
        this.patError = result.message || 'Invalid PAT';
      }
    } catch (e: any) {
      this.patError = e.message || 'Validation failed';
    } finally {
      this.patValidating = false;
    }
  }

  disconnectPat(): void {
    this.settingsService.clearPatConfig();
    this.patConfigured = false;
    this.sprintLabelMap.clear();
    this.sprintIterations = [];
  }

  // ─────────────────────────────────────────────────────────
  // Date Formatting (template-facing wrappers)
  // ─────────────────────────────────────────────────────────

  isToday(date: Date): boolean {
    return dateIsToday(date);
  }

  isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 5 || day === 6; // Fri + Sat (regional weekend)
  }

  formatDay(date: Date): string {
    return dateFmtDay(date);
  }

  formatDate(date: Date): string {
    return formatShortDate(date);
  }

  formatWeekRange(): string {
    const end = shiftDays(this.weekStart, 13);
    return `${formatShortDate(this.weekStart)} – ${formatFullDate(end)}`;
  }

  toDateString(date: Date): string {
    return toDateString(date);
  }

  // ─────────────────────────────────────────────────────────
  // Sprint / PI Labels
  // ─────────────────────────────────────────────────────────

  async loadSprintData(): Promise<void> {
    if (!this.azureDevOps.isConfigured()) {
      this.azureDevOps.restoreConfig();
    }
    if (!this.azureDevOps.isConfigured()) return;

    try {
      const team = this.settingsService.sprintTeam || this.patTeam;
      this.sprintIterations = await this.azureDevOps.getAllIterations(team);
    } catch {
      // Sprint labels are optional; silently degrade
    }
    this.buildSprintLabels();
  }

  getSprintLabel(date: Date): string {
    return this.sprintLabelMap.get(toDateString(date)) ?? '';
  }

  private buildSprintLabels(): void {
    this.sprintLabelMap.clear();
    for (const date of this.weekDates) {
      const label = this.computeSprintLabel(date);
      if (label) {
        this.sprintLabelMap.set(toDateString(date), label);
      }
    }
  }

  private computeSprintLabel(date: Date): string {
    const dateStr = toDateString(date);
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) return '';

    const workDay = dayOfWeek === 0 ? 1 : dayOfWeek + 1;
    const iteration = this.sprintIterations.find(
      (it) => dateStr >= it.startDate && dateStr <= it.finishDate,
    );
    if (!iteration) return '';

    const sprintStart = new Date(iteration.startDate + 'T00:00:00');
    const dayDiff = Math.floor((date.getTime() - sprintStart.getTime()) / 86_400_000);
    const sprintWeek = Math.floor(dayDiff / 7) + 1;

    return `BAU ${iteration.name}.${sprintWeek}.${workDay}`;
  }

  // ─────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Find a conflicting reservation for the given env / date range / services.
   * Returns a user-friendly error message, or null if no conflict.
   */
  private findConflict(
    env: string,
    startDate: string,
    endDate: string,
    services: string[],
    excludeId?: string,
  ): string | null {
    const svcSet = new Set(services);
    const conflict = this.reservations.find((r) => {
      if (excludeId && r.id === excludeId) return false;
      if (r.environment !== env) return false;
      if (!dateRangesOverlap(startDate, endDate, r.startDate, r.endDate)) return false;
      return (r.services ?? []).some((s) => svcSet.has(s));
    });
    if (!conflict) return null;
    const overlap = (conflict.services ?? []).filter((s) => svcSet.has(s));
    return `Service(s) ${overlap.join(', ')} conflict with "${conflict.userName}" (${conflict.startDate} → ${conflict.endDate}).`;
  }

  /** Map Firebase errors to user-friendly messages */
  private formatFirebaseError(err: any): string {
    const msg = err?.message ?? err?.code ?? String(err);
    if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
      return 'Permission denied. Make sure Firestore is in test mode (Firebase Console → Firestore → Rules).';
    }
    if (msg.includes('NOT_FOUND') || msg.includes('not found')) {
      return 'Firestore database not found. Create it in Firebase Console → Firestore Database → Create database.';
    }
    return `Failed to save: ${msg}`;
  }
}

// ── Standalone Helper ────────────────────────────────────────

/** Toggle an item in/out of an array (mutates in place) */
function toggleInArray<T>(arr: T[], item: T): void {
  const idx = arr.indexOf(item);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(item);
}
