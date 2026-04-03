import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { JsonDbService } from './json-db.service';
import { DROP_DB_BRANCHES } from '../models/release-pipeline.model';

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



export type EnvCategory = 'reservation' | 'cutoff' | 'deploy';

export interface PatConfig {
  organization: string;
  project: string;
  pat: string;
}

/** Build categories that can be toggled on/off */
export type BuildCategoryId = 'release' | 'master' | 'drop-db';

export const ALL_BUILD_CATEGORIES: BuildCategoryId[] = ['release', 'master', 'drop-db'];

export const BUILD_CATEGORY_LABELS: Record<BuildCategoryId, string> = {
  'release': 'Release Build',
  'master': 'Master Build',
  'drop-db': 'Drop DB Build',
};

export const BUILD_CATEGORY_DESCRIPTIONS: Record<BuildCategoryId, string> = {
  'release': 'Build the release branch for deployment',
  'master': 'Build master branch in parallel',
  'drop-db': 'Build drop DB branch for applicable services',
};

/** Pipeline step IDs that can be toggled on/off */
export type PipelineStepId =
  | 'validate-pat'
  | 'create-branch'
  | 'create-pr'
  | 'build-both'
  | 'deploy-drop-db'
  | 'deploy-master'
  | 'deploy-release';

/** Default: all steps enabled */
export const ALL_PIPELINE_STEPS: PipelineStepId[] = [
  'validate-pat',
  'create-branch',
  'create-pr',
  'build-both',
  'deploy-drop-db',
  'deploy-master',
  'deploy-release',
];

/** Human-readable labels for each step */
export const PIPELINE_STEP_LABELS: Record<PipelineStepId, string> = {
  'validate-pat': 'Validate PAT',
  'create-branch': 'Create Release Branch',
  'create-pr': 'Create Pull Request',
  'build-both': 'Build Release & Master',
  'deploy-drop-db': 'Deploy Drop DB',
  'deploy-master': 'Deploy Master Build',
  'deploy-release': 'Deploy Release Build',
};

/** Descriptions for each step */
export const PIPELINE_STEP_DESCRIPTIONS: Record<PipelineStepId, string> = {
  'validate-pat': 'Verify Azure DevOps PAT has access',
  'create-branch': 'Create release branch from develop',
  'create-pr': 'Create Pull Request from release → master',
  'build-both': 'Build release branch and master in parallel',
  'deploy-drop-db': 'Deploy drop DB build (failure expected)',
  'deploy-master': 'Deploy master build to target environment',
  'deploy-release': 'Deploy release build to target environment',
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private jsonDb = inject(JsonDbService);

  private static readonly SETTINGS_FILE = '/db/settings.json';
  private static readonly SETTINGS_CACHE_KEY = 'mva_settings_cache';

  // ── Service Configs (per-service settings) ─────────────────

  private _serviceConfigs$ = new BehaviorSubject<ServiceConfig[]>([]);
  serviceConfigs$: Observable<ServiceConfig[]> = this._serviceConfigs$.asObservable();

  get serviceConfigs(): ServiceConfig[] {
    return this._serviceConfigs$.value;
  }

  // ── Microservices (derived from service configs for backward compat) ──
  private _microservices$ = new BehaviorSubject<string[]>([]);
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

  private _environments$ = new BehaviorSubject<string[]>([]);
  environments$: Observable<string[]> = this._environments$.asObservable();

  get environments(): string[] {
    return this._environments$.value;
  }

  // ── Per-tab Environments ───────────────────────────────────

  private _envsReservation$ = new BehaviorSubject<string[]>([]);
  envsReservation$: Observable<string[]> = this._envsReservation$.asObservable();
  get envsReservation(): string[] { return this._envsReservation$.value; }

  private _envsCutoff$ = new BehaviorSubject<string[]>([]);
  envsCutoff$: Observable<string[]> = this._envsCutoff$.asObservable();
  get envsCutoff(): string[] { return this._envsCutoff$.value; }

  private _envsDeploy$ = new BehaviorSubject<string[]>([]);
  envsDeploy$: Observable<string[]> = this._envsDeploy$.asObservable();
  get envsDeploy(): string[] { return this._envsDeploy$.value; }

  // ── PAT Config (per-user, stored in localStorage) ─────────
  private static readonly PAT_STORAGE_KEY = 'mva_pat_config';
  private _patConfig$ = new BehaviorSubject<PatConfig | null>(this.loadPatFromLocalStorage());
  patConfig$: Observable<PatConfig | null> = this._patConfig$.asObservable();

  get patConfig(): PatConfig | null {
    return this._patConfig$.value;
  }

  private loadPatFromLocalStorage(): PatConfig | null {
    try {
      const raw = localStorage.getItem(SettingsService.PAT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // ── Sprint Team (per-user, stored in localStorage) ─────────
  private static readonly SPRINT_TEAM_KEY = 'mva_sprint_team';
  private _sprintTeam$ = new BehaviorSubject<string>(this.loadSprintTeamFromLocalStorage());
  sprintTeam$: Observable<string> = this._sprintTeam$.asObservable();

  get sprintTeam(): string {
    return this._sprintTeam$.value;
  }

  private loadSprintTeamFromLocalStorage(): string {
    try {
      return localStorage.getItem('mva_sprint_team') || '';
    } catch {
      return '';
    }
  }

  // ── Pipeline Step Toggles (shared, stored in JSON DB) ─────
  private _disabledSteps$ = new BehaviorSubject<PipelineStepId[]>([]);
  disabledSteps$: Observable<PipelineStepId[]> = this._disabledSteps$.asObservable();

  get disabledSteps(): PipelineStepId[] {
    return this._disabledSteps$.value;
  }

  /** Returns true if the given pipeline step is enabled (not disabled) */
  isStepEnabled(stepId: PipelineStepId): boolean {
    return !this._disabledSteps$.value.includes(stepId);
  }

  /** Toggle a pipeline step on or off */
  togglePipelineStep(stepId: PipelineStepId, enabled: boolean): void {
    this.toggleInList(this._disabledSteps$, stepId, enabled);
  }

  /** Reset all pipeline steps to enabled */
  resetPipelineSteps(): void {
    this._disabledSteps$.next([]);
    this.syncToJsonDb();
  }

  // ── Build Category Toggles (shared, stored in JSON DB) ────
  private _disabledBuildCategories$ = new BehaviorSubject<BuildCategoryId[]>(['drop-db']);
  disabledBuildCategories$: Observable<BuildCategoryId[]> = this._disabledBuildCategories$.asObservable();

  get disabledBuildCategories(): BuildCategoryId[] {
    return this._disabledBuildCategories$.value;
  }

  isBuildCategoryEnabled(catId: BuildCategoryId): boolean {
    return !this._disabledBuildCategories$.value.includes(catId);
  }

  toggleBuildCategory(catId: BuildCategoryId, enabled: boolean): void {
    this.toggleInList(this._disabledBuildCategories$, catId, enabled);
  }

  /** Generic toggle helper: add/remove an item from a BehaviorSubject list and sync */
  private toggleInList<T>(subject: BehaviorSubject<T[]>, id: T, enabled: boolean): void {
    let list = [...subject.value];
    if (enabled) {
      list = list.filter((item) => item !== id);
    } else if (!list.includes(id)) {
      list.push(id);
    }
    subject.next(list);
    this.syncToJsonDb();
  }

  /** Whether settings have been loaded */
  private _settingsReady$ = new BehaviorSubject<boolean>(false);
  settingsReady$: Observable<boolean> = this._settingsReady$.asObservable();

  constructor() {
    // 1. Load from localStorage cache (instant, works without PAT)
    this.loadFromCache();
    // 2. Then try to load from the JSON DB (async, needs PAT)
    this.initFromJsonDb();
  }

  // ── Load from localStorage cache ──────────────────────────

  private loadFromCache(): void {
    try {
      const raw = localStorage.getItem(SettingsService.SETTINGS_CACHE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.applyData(data);
      }
    } catch {
      // Cache miss or corrupt — will load from repo
    }
  }

  /** Save current state to localStorage cache */
  private saveToCache(): void {
    try {
      const data = this.buildSettingsPayload();
      localStorage.setItem(SettingsService.SETTINGS_CACHE_KEY, JSON.stringify(data));
    } catch {
      // localStorage full or unavailable
    }
  }

  // ── Load from JSON DB (git repo) or local asset ──────────

  private async initFromJsonDb(): Promise<void> {
    try {
      // First try reading from the git repo (latest version)
      let data = await this.jsonDb.readFile(SettingsService.SETTINGS_FILE);
      // If no PAT or repo read failed, fall back to the local static asset
      if (!data) {
        data = await this.fetchLocalAsset();
      }
      if (data) {
        this.applyData(data);
        this.saveToCache();
      }
    } catch (err) {
      console.warn('Failed to load settings from JSON DB:', err);
      // Last resort: try local asset
      try {
        const data = await this.fetchLocalAsset();
        if (data) {
          this.applyData(data);
          this.saveToCache();
        }
      } catch { /* already cached from constructor */ }
    }
    this._settingsReady$.next(true);
  }

  /** Fetch settings from the local static asset served by Angular */
  private async fetchLocalAsset(): Promise<any> {
    try {
      const res = await fetch('/db/settings.json');
      if (res.ok) return res.json();
    } catch { /* not available */ }
    return null;
  }

  /** Refresh settings from the JSON DB (can be called manually) */
  async refreshFromDb(): Promise<void> {
    await this.initFromJsonDb();
  }

  /** Apply settings data to all BehaviorSubjects */
  private applyData(data: any): void {
    if (Array.isArray(data.serviceConfigs) && data.serviceConfigs.length) {
      const configs: ServiceConfig[] = data.serviceConfigs;
      this._serviceConfigs$.next(configs);
      this._microservices$.next(configs.map((c) => c.name));
    }

    if (Array.isArray(data.environments) && data.environments.length) {
      this._environments$.next(data.environments);
    }

    // Per-tab environments
    for (const cat of ['reservation', 'cutoff', 'deploy'] as EnvCategory[]) {
      const key = `envs_${cat}`;
      if (Array.isArray(data[key])) {
        this.envSubjectMap[cat].next(data[key]);
      }
    }

    // Disabled pipeline steps
    if (Array.isArray(data.disabledPipelineSteps)) {
      this._disabledSteps$.next(data.disabledPipelineSteps);
    }

    // Disabled build categories
    if (Array.isArray(data.disabledBuildCategories)) {
      this._disabledBuildCategories$.next(data.disabledBuildCategories);
    }
  }

  /** Build the settings payload for persistence */
  private buildSettingsPayload(): any {
    return {
      serviceConfigs: structuredClone(this._serviceConfigs$.value),
      environments: [...this._environments$.value],
      envs_reservation: [...this._envsReservation$.value],
      envs_cutoff: [...this._envsCutoff$.value],
      envs_deploy: [...this._envsDeploy$.value],
      disabledPipelineSteps: [...this._disabledSteps$.value],
      disabledBuildCategories: [...this._disabledBuildCategories$.value],
      updatedAt: new Date().toISOString(),
    };
  }

  /** Persist current shared settings to JSON DB (git repo) and local cache */
  private async syncToJsonDb(): Promise<void> {
    // Always update local cache immediately
    this.saveToCache();
    // Then try to push to the repo
    try {
      const payload = this.buildSettingsPayload();
      await this.jsonDb.writeFile(SettingsService.SETTINGS_FILE, payload, 'Update settings');
    } catch (err) {
      console.warn('Failed to sync settings to JSON DB:', err);
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
    this.saveMicroservices([]);
    this.saveServiceConfigs([]);
  }

  // ── Service Config CRUD ────────────────────────────────────

  /** Get config for one service (with defaults if not yet configured) */
  getServiceConfig(name: string): ServiceConfig {
    const existing = this._serviceConfigs$.value.find((c) => c.name === name);
    if (existing) return existing;
    return { name, type: 'service', branchPrefix: 'release/primary', pipelineType: 'release' };
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
    this.saveServiceConfigs([]);
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

  /** Get the drop_db branch, or null — checks stored config first, falls back to DROP_DB_BRANCHES constant.
   *  Returns null if explicitly set to 'NA'. */
  getDropDbBranch(svc: string): string | null {
    const cfg = this.getServiceConfig(svc);
    if (cfg.dropDbBranch === 'NA') return null;
    return cfg.dropDbBranch || DROP_DB_BRANCHES[svc] || null;
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
    this.saveEnvironments([]);
  }

  // ── Per-tab Environment CRUD ───────────────────────────────

  /** Map from EnvCategory to the corresponding subject */
  private readonly envSubjectMap = {
    reservation: this._envsReservation$,
    cutoff: this._envsCutoff$,
    deploy: this._envsDeploy$,
  };

  getEnvs(cat: EnvCategory): string[] {
    return this.envSubjectMap[cat]?.value ?? this.envsDeploy;
  }

  getEnvs$(cat: EnvCategory): Observable<string[]> {
    return this.envSubjectMap[cat]?.asObservable() ?? this.envsDeploy$;
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
    this.saveEnvList(cat, []);
  }

  private saveEnvList(cat: EnvCategory, list: string[]): void {
    this.envSubjectMap[cat]?.next(list);
    this.syncToJsonDb();
  }

  // ── PAT Config ─────────────────────────────────────────────

  savePatConfig(config: PatConfig): void {
    this._patConfig$.next(config);
    try { localStorage.setItem(SettingsService.PAT_STORAGE_KEY, JSON.stringify(config)); } catch {}
  }

  clearPatConfig(): void {
    this._patConfig$.next(null);
    this._sprintTeam$.next('');
    try { localStorage.removeItem(SettingsService.PAT_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(SettingsService.SPRINT_TEAM_KEY); } catch {}
  }

  // ── Sprint Team ────────────────────────────────────────────

  saveSprintTeam(team: string): void {
    this._sprintTeam$.next(team);
    try { localStorage.setItem(SettingsService.SPRINT_TEAM_KEY, team); } catch {}
  }

  // ── Private helpers ────────────────────────────────────────

  private saveMicroservices(list: string[]): void {
    this._microservices$.next(list);
    this.syncToJsonDb();
  }

  private saveEnvironments(list: string[]): void {
    this._environments$.next(list);
    this.syncToJsonDb();
  }

  private saveServiceConfigs(configs: ServiceConfig[]): void {
    this._serviceConfigs$.next(configs);
    this.syncToJsonDb();
  }
}
