import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, filter, take } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  DocumentReference,
} from '@angular/fire/firestore';
import { SERVICE_META } from '../models/reservation.model';
import { AuthService } from './auth.service';

// ── Per-service configuration ──────────────────────────────────────────

/** Whether the service is a deployable microservice or a shared library */
export type ServiceType = 'service' | 'library';

/** How the service is deployed: classic Release pipeline or YAML pipeline */
export type PipelineType = 'release' | 'yaml';

/** Full config for a single microservice / library */
export interface ServiceConfig {
  /** Repo / service name, e.g. 'mvax-api' */
  name: string;
  /** service = deployable, library = no deploy step */
  type: ServiceType;
  /** Branch prefix used when creating the release branch, e.g. 'release/primary' or 'primary' */
  branchPrefix: string;
  /** Pipeline type used for release */
  pipelineType: PipelineType;
  /** Optional drop_db branch (only for some services) */
  dropDbBranch?: string;
}

// ── Default values (matching current hardcoded lists) ──────────────────

export const DEFAULT_SERVICE_CONFIGS: ServiceConfig[] = [
  { name: 'mvax-api',               type: 'service', branchPrefix: 'release/primary', pipelineType: 'release', dropDbBranch: 'release/gouna/drop_db' },
  { name: 'mvax-native-billing',    type: 'service', branchPrefix: 'release/primary', pipelineType: 'release', dropDbBranch: 'release/dahab/drop_db' },
  { name: 'mvax-offers',            type: 'service', branchPrefix: 'release/primary', pipelineType: 'release' },
  { name: 'mvax-upgrades',          type: 'service', branchPrefix: 'release/primary', pipelineType: 'release', dropDbBranch: 'release/dahab/drop_db' },
  { name: 'mvax-authentication',    type: 'service', branchPrefix: 'release/primary', pipelineType: 'release' },
  { name: 'mvax-plan-services',     type: 'service', branchPrefix: 'release/primary', pipelineType: 'release', dropDbBranch: 'release/drop_db' },
  { name: 'mvax-adobe-integrator',  type: 'service', branchPrefix: 'release/primary', pipelineType: 'release' },
  { name: 'mvax-account-dashboard', type: 'service', branchPrefix: 'release/primary', pipelineType: 'release' },
  { name: 'mvax-common',            type: 'library', branchPrefix: 'primary',         pipelineType: 'yaml' },
  { name: 'mvax-population-engine', type: 'library', branchPrefix: 'primary',         pipelineType: 'yaml' },
];

export const DEFAULT_MICROSERVICES = DEFAULT_SERVICE_CONFIGS.map((c) => c.name);

export const DEFAULT_ENVIRONMENTS = [
  'int1',
  'dev1',
  'qcx',
  'qc1',
  'qc2',
  'qc5',
  'prodsup',
  'pat2',
  'pat3',
  'prod1-blue',
];

/** Per-tab default environments */
export const DEFAULT_ENVS_RESERVATION = ['int1', 'dev1', 'qcx', 'qc1', 'qc2', 'qc5', 'prodsup', 'pat2', 'pat3', 'prod1-blue'];
export const DEFAULT_ENVS_CUTOFF     = ['qc1', 'qc2', 'qcx'];
export const DEFAULT_ENVS_DEPLOY     = ['int1', 'dev1', 'qcx', 'qc1', 'qc2', 'qc5', 'prodsup', 'pat2', 'pat3', 'prod1-blue'];

export type EnvCategory = 'reservation' | 'cutoff' | 'deploy';

export interface PatConfig {
  organization: string;
  project: string;
  pat: string;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private settingsDocRef = doc(this.firestore, 'settings', 'global');
  private userDocRef: DocumentReference | null = null;

  // ── Service Configs (per-service settings) ─────────────────
  private _serviceConfigs$ = new BehaviorSubject<ServiceConfig[]>([...DEFAULT_SERVICE_CONFIGS]);
  serviceConfigs$: Observable<ServiceConfig[]> = this._serviceConfigs$.asObservable();

  get serviceConfigs(): ServiceConfig[] {
    return this._serviceConfigs$.value;
  }

  // ── Microservices (derived from service configs for backward compat) ──
  private _microservices$ = new BehaviorSubject<string[]>([...DEFAULT_MICROSERVICES]);
  microservices$: Observable<string[]> = this._microservices$.asObservable();

  get microservices(): string[] {
    return this._microservices$.value;
  }

  /** Only services (type === 'service'), excluding libraries */
  get servicesOnly(): string[] {
    return this._serviceConfigs$.value
      .filter((c) => c.type === 'service')
      .map((c) => c.name);
  }

  /** Observable of service-only names (no libraries) */
  servicesOnly$: Observable<string[]> = this._serviceConfigs$.pipe(
    map((configs) => configs.filter((c) => c.type === 'service').map((c) => c.name))
  );

  // ── Environments ───────────────────────────────────────────
  private _environments$ = new BehaviorSubject<string[]>([...DEFAULT_ENVIRONMENTS]);
  environments$: Observable<string[]> = this._environments$.asObservable();

  get environments(): string[] {
    return this._environments$.value;
  }

  // ── Per-tab Environments ───────────────────────────────────
  private _envsReservation$ = new BehaviorSubject<string[]>([...DEFAULT_ENVS_RESERVATION]);
  envsReservation$: Observable<string[]> = this._envsReservation$.asObservable();
  get envsReservation(): string[] { return this._envsReservation$.value; }

  private _envsCutoff$ = new BehaviorSubject<string[]>([...DEFAULT_ENVS_CUTOFF]);
  envsCutoff$: Observable<string[]> = this._envsCutoff$.asObservable();
  get envsCutoff(): string[] { return this._envsCutoff$.value; }

  private _envsDeploy$ = new BehaviorSubject<string[]>([...DEFAULT_ENVS_DEPLOY]);
  envsDeploy$: Observable<string[]> = this._envsDeploy$.asObservable();
  get envsDeploy(): string[] { return this._envsDeploy$.value; }

  // ── PAT Config (per-user, stored in Firestore) ────────────
  private _patConfig$ = new BehaviorSubject<PatConfig | null>(null);
  patConfig$: Observable<PatConfig | null> = this._patConfig$.asObservable();

  get patConfig(): PatConfig | null {
    return this._patConfig$.value;
  }

  // ── Sprint Team (per-user, stored in Firestore) ────────────
  private _sprintTeam$ = new BehaviorSubject<string>('');
  sprintTeam$: Observable<string> = this._sprintTeam$.asObservable();

  get sprintTeam(): string {
    return this._sprintTeam$.value;
  }

  /** Whether the per-user settings have been loaded from Firestore */
  private _userSettingsReady$ = new BehaviorSubject<boolean>(false);
  userSettingsReady$: Observable<boolean> = this._userSettingsReady$.asObservable();

  constructor() {
    // Load shared settings from Firestore
    this.initFromFirestore();
    // Load per-user settings (PAT, sprint team) from Firestore
    this.initUserSettings();
  }

  /** Load per-user settings from Firestore once auth is ready */
  private initUserSettings(): void {
    this.authService.user$.pipe(
      filter((user) => user !== null),
      take(1),
    ).subscribe(async (user) => {
      if (!user) return;
      this.userDocRef = doc(this.firestore, 'users', user.uid);
      try {
        const snap = await getDoc(this.userDocRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data['patConfig']) {
            this._patConfig$.next(data['patConfig']);
          }
          if (data['sprintTeam']) {
            this._sprintTeam$.next(data['sprintTeam']);
          }
        }
      } catch (err) {
        console.warn('Failed to load user settings from Firestore:', err);
      }
      this._userSettingsReady$.next(true);
    });
  }

  /** One-time initial fetch from Firestore, then start real-time listener */
  private async initFromFirestore(): Promise<void> {
    try {
      const snap = await getDoc(this.settingsDocRef);
      if (snap.exists()) {
        this.applyFirestoreData(snap.data());
      } else {
        // First time — seed Firestore with current defaults
        await this.syncToFirestore();
      }
    } catch (err) {
      console.warn('Initial Firestore load failed (using defaults):', err);
    }
    // Now start real-time listener for ongoing changes from other clients
    this.listenToFirestore();
  }

  /** Apply Firestore data to all BehaviorSubjects */
  private applyFirestoreData(data: any): void {
    if (Array.isArray(data.serviceConfigs) && data.serviceConfigs.length) {
      const configs: ServiceConfig[] = data.serviceConfigs;
      this._serviceConfigs$.next(configs);
      this._microservices$.next(configs.map((c) => c.name));
    }

    if (Array.isArray(data.environments) && data.environments.length) {
      this._environments$.next(data.environments);
    }

    // Per-tab environments
    const envSubjects: Record<EnvCategory, BehaviorSubject<string[]>> = {
      reservation: this._envsReservation$,
      cutoff:      this._envsCutoff$,
      deploy:      this._envsDeploy$,
    };
    for (const [cat, subj] of Object.entries(envSubjects)) {
      const key = `envs_${cat}`;
      if (Array.isArray(data[key])) {
        subj.next(data[key]);
      }
    }
  }

  /** Listen for real-time changes from Firestore and update local state */
  private listenToFirestore(): void {
    onSnapshot(this.settingsDocRef, (snap) => {
      if (!snap.exists()) return;
      this.applyFirestoreData(snap.data());
    }, (err) => {
      console.warn('Firestore settings listener error:', err);
    });
  }

  /** Persist current shared settings to Firestore */
  private async syncToFirestore(): Promise<void> {
    try {
      await setDoc(this.settingsDocRef, {
        serviceConfigs: JSON.parse(JSON.stringify(this._serviceConfigs$.value)),
        environments: [...this._environments$.value],
        envs_reservation: [...this._envsReservation$.value],
        envs_cutoff: [...this._envsCutoff$.value],
        envs_deploy: [...this._envsDeploy$.value],
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.warn('Failed to sync settings to Firestore:', err);
    }
  }

  // ── Microservice CRUD ──────────────────────────────────────

  addMicroservice(name: string): void {
    const normalized = name.trim().toLowerCase();
    if (!normalized || this._microservices$.value.includes(normalized)) return;
    const updated = [...this._microservices$.value, normalized];
    this.saveMicroservices(updated);
  }

  removeMicroservice(name: string): void {
    const updated = this._microservices$.value.filter((s) => s !== name);
    this.saveMicroservices(updated);
    // Also remove from service configs
    const cfgs = this._serviceConfigs$.value.filter((c) => c.name !== name);
    this.saveServiceConfigs(cfgs);
  }

  reorderMicroservices(list: string[]): void {
    this.saveMicroservices(list);
  }

  resetMicroservices(): void {
    this.saveMicroservices([...DEFAULT_MICROSERVICES]);
    this.saveServiceConfigs([...DEFAULT_SERVICE_CONFIGS]);
  }

  // ── Service Config CRUD ────────────────────────────────────

  /** Get config for one service (with defaults if not yet configured) */
  getServiceConfig(name: string): ServiceConfig {
    const existing = this._serviceConfigs$.value.find((c) => c.name === name);
    if (existing) return existing;
    // Fallback to defaults
    const defaultCfg = DEFAULT_SERVICE_CONFIGS.find((c) => c.name === name);
    return defaultCfg ?? { name, type: 'service', branchPrefix: 'release/primary', pipelineType: 'release' };
  }

  /** Update config for one service */
  updateServiceConfig(name: string, partial: Partial<ServiceConfig>): void {
    const configs = [...this._serviceConfigs$.value];
    const idx = configs.findIndex((c) => c.name === name);
    if (idx >= 0) {
      configs[idx] = { ...configs[idx], ...partial };
    } else {
      const base = this.getServiceConfig(name);
      configs.push({ ...base, ...partial });
    }
    this.saveServiceConfigs(configs);
  }

  /** Add a brand-new service with full config */
  addServiceWithConfig(config: ServiceConfig): void {
    const normalized = config.name.trim().toLowerCase();
    if (!normalized) return;
    // Add to names list
    if (!this._microservices$.value.includes(normalized)) {
      this.saveMicroservices([...this._microservices$.value, normalized]);
    }
    // Add / replace in configs
    const configs = this._serviceConfigs$.value.filter((c) => c.name !== normalized);
    configs.push({ ...config, name: normalized });
    this.saveServiceConfigs(configs);
  }

  /** Reset service configs to defaults */
  resetServiceConfigs(): void {
    this.saveServiceConfigs([...DEFAULT_SERVICE_CONFIGS]);
  }

  // ── Dynamic model helpers (replace hardcoded functions) ────

  /** Returns true if the service is a library */
  isLibraryService(svc: string): boolean {
    return this.getServiceConfig(svc).type === 'library';
  }

  /** Get the release branch name for a service */
  getReleaseBranch(svc: string, releaseNumber: string): string {
    const cfg = this.getServiceConfig(svc);
    return `${cfg.branchPrefix}/${releaseNumber}`;
  }

  /** Get the drop_db branch, or null */
  getDropDbBranch(svc: string): string | null {
    return this.getServiceConfig(svc).dropDbBranch ?? null;
  }

  /** Get the pipeline type */
  getPipelineType(svc: string): PipelineType {
    return this.getServiceConfig(svc).pipelineType;
  }

  // ── Environment CRUD ───────────────────────────────────────

  addEnvironment(name: string): void {
    const normalized = name.trim().toLowerCase();
    if (!normalized || this._environments$.value.includes(normalized)) return;
    const updated = [...this._environments$.value, normalized];
    this.saveEnvironments(updated);
  }

  removeEnvironment(name: string): void {
    const updated = this._environments$.value.filter((e) => e !== name);
    this.saveEnvironments(updated);
  }

  reorderEnvironments(list: string[]): void {
    this.saveEnvironments(list);
  }

  resetEnvironments(): void {
    this.saveEnvironments([...DEFAULT_ENVIRONMENTS]);
  }

  // ── Per-tab Environment CRUD ───────────────────────────────

  getEnvs(cat: EnvCategory): string[] {
    return cat === 'reservation' ? this.envsReservation : cat === 'cutoff' ? this.envsCutoff : this.envsDeploy;
  }

  getEnvs$(cat: EnvCategory): Observable<string[]> {
    return cat === 'reservation' ? this.envsReservation$ : cat === 'cutoff' ? this.envsCutoff$ : this.envsDeploy$;
  }

  addEnv(cat: EnvCategory, name: string): void {
    const normalized = name.trim().toLowerCase();
    const list = this.getEnvs(cat);
    if (!normalized || list.includes(normalized)) return;
    this.saveEnvList(cat, [...list, normalized]);
  }

  removeEnv(cat: EnvCategory, name: string): void {
    this.saveEnvList(cat, this.getEnvs(cat).filter((e) => e !== name));
  }

  reorderEnvs(cat: EnvCategory, list: string[]): void {
    this.saveEnvList(cat, list);
  }

  resetEnvs(cat: EnvCategory): void {
    const defaults = cat === 'reservation' ? DEFAULT_ENVS_RESERVATION : cat === 'cutoff' ? DEFAULT_ENVS_CUTOFF : DEFAULT_ENVS_DEPLOY;
    this.saveEnvList(cat, [...defaults]);
  }

  private saveEnvList(cat: EnvCategory, list: string[]): void {
    const subj = cat === 'reservation' ? this._envsReservation$ : cat === 'cutoff' ? this._envsCutoff$ : this._envsDeploy$;
    subj.next(list);
    this.syncToFirestore();
  }

  // ── PAT Config ─────────────────────────────────────────────

  savePatConfig(config: PatConfig): void {
    this._patConfig$.next(config);
    this.syncUserSettings();
  }

  clearPatConfig(): void {
    this._patConfig$.next(null);
    this._sprintTeam$.next('');
    this.syncUserSettings();
  }

  // ── Sprint Team ────────────────────────────────────────────

  saveSprintTeam(team: string): void {
    this._sprintTeam$.next(team);
    this.syncUserSettings();
  }

  // ── Private helpers ────────────────────────────────────────

  /** Persist per-user settings (PAT, sprint team) to Firestore */
  private async syncUserSettings(): Promise<void> {
    if (!this.userDocRef) return;
    try {
      const pat = this._patConfig$.value;
      await setDoc(this.userDocRef, {
        patConfig: pat ? JSON.parse(JSON.stringify(pat)) : null,
        sprintTeam: this._sprintTeam$.value || null,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.warn('Failed to sync user settings to Firestore:', err);
    }
  }

  private saveMicroservices(list: string[]): void {
    this._microservices$.next(list);
    this.syncToFirestore();
  }

  private saveEnvironments(list: string[]): void {
    this._environments$.next(list);
    this.syncToFirestore();
  }

  private saveServiceConfigs(configs: ServiceConfig[]): void {
    this._serviceConfigs$.next(configs);
    this.syncToFirestore();
  }
}
