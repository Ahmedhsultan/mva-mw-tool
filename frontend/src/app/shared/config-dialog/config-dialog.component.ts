import { Component, computed, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppTabKey, AppTabProviders, DevOpsProvider, ProviderSettings, RepoProfile, RepoProfileType } from '../../core/models';

interface ConfigCatalogState {
  environments: string[];
  repoProfiles: RepoProfile[];
}

@Component({
  selector: 'app-config-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDividerModule
  ],
  templateUrl: './config-dialog.component.html',
  styleUrl: './config-dialog.component.scss'
})
export class ConfigDialogComponent implements OnInit {
  private readonly defaultGitHubConfigRepoId = 'mva-mw-tool';

  provider: DevOpsProvider = 'azure';
  configProvider: DevOpsProvider = 'azure';
  appTabs: AppTabKey[] = ['overview', 'pipelines', 'config'];
  tabProviders: AppTabProviders = {
    overview: 'azure',
    pipelines: 'azure',
    config: 'azure'
  };
  organization = '';
  project = '';
  token = '';
  hideToken = signal(true);
  isLoadingConfig = signal(false);
  isSavingConfig = signal(false);
  isConfigBusy = computed(() => this.isLoadingConfig() || this.isSavingConfig());

  environments: string[] = [];
  repoProfiles: RepoProfile[] = [];
  newEnvName = '';
  newRepositoryName = '';
  newRepositoryType: RepoProfileType = 'service';
  dbRepoId = '';
  dbBranch = 'main';
  configLoaded = false;
  loadError = '';
  repoProfilesDirty = false;
  private lastSavedState: ConfigCatalogState = {
    environments: [],
    repoProfiles: []
  };

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private dialogRef: MatDialogRef<ConfigDialogComponent>,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const config = this.authService.getConfig();
    this.tabProviders = config.tabProviders;
    this.configProvider = this.tabProviders.config;
    this.provider = this.configProvider;
    this.applyProviderSettings(this.authService.getProviderSettings(this.provider));
    this.dbRepoId = this.resolveDbRepoId(config.dbRepoId);
    this.dbBranch = config.dbBranch.trim() || 'main';
    this.persistConfigSource(this.dbRepoId, this.dbBranch);

    this.loadConfig();
  }

  get repositories(): string[] {
    const values = new Set<string>();

    for (const repoProfile of this.repoProfiles) {
      const value = repoProfile.name.trim();
      if (value) {
        values.add(value);
      }
    }

    return [...values];
  }

  saveProviderSettings(): void {
    this.authService.updateProviderSettings(this.provider, {
      pat: this.token,
      organization: this.organization.trim(),
      project: this.project.trim()
    });

    this.snackBar.open(`${this.providerLabel()} settings updated`, 'Close', {
      duration: 2000,
      panelClass: 'success-snackbar'
    });

    if (this.dbRepoId.trim()) {
      this.loadConfig();
    }
  }

  repoTypeLabel(type: RepoProfileType): string {
    return type === 'library' ? 'Library' : 'Service';
  }

  setAppTabProvider(tab: AppTabKey, provider: DevOpsProvider): void {
    this.tabProviders = {
      ...this.tabProviders,
      [tab]: provider
    };

    this.authService.updateTabProvider(tab, provider);

    if (tab === 'config') {
      this.configProvider = provider;
      this.provider = provider;
      this.applyProviderSettings(this.authService.getProviderSettings(provider));
      this.dbRepoId = this.resolveDbRepoId(this.dbRepoId);
      this.persistConfigSource(this.dbRepoId, this.dbBranch);
      this.loadConfig();
    }
  }

  isAppTabProviderSelected(tab: AppTabKey, provider: DevOpsProvider): boolean {
    return this.tabProviders[tab] === provider;
  }

  tabLabel(tab: AppTabKey): string {
    switch (tab) {
      case 'overview':
        return 'Overview';
      case 'pipelines':
        return 'Pipelines';
      default:
        return 'Config';
    }
  }

  setProvider(provider: DevOpsProvider): void {
    this.provider = provider;
    this.applyProviderSettings(this.authService.getProviderSettings(provider));
  }

  isProviderSelected(provider: DevOpsProvider): boolean {
    return this.provider === provider;
  }

  providerLabel(): string {
    return this.provider === 'github' ? 'GitHub' : 'Azure DevOps';
  }

  providerName(provider: DevOpsProvider): string {
    return provider === 'github' ? 'GitHub' : 'Azure DevOps';
  }

  organizationLabel(): string {
    return this.provider === 'github' ? 'Owner / Organization' : 'Organization';
  }

  organizationPlaceholder(): string {
    return this.provider === 'github' ? 'my-org-or-user' : 'my-org';
  }

  projectLabel(): string {
    return this.provider === 'github' ? 'Project / Workspace' : 'Project';
  }

  projectPlaceholder(): string {
    return this.provider === 'github' ? 'optional-workspace' : 'my-project';
  }

  tokenLabel(): string {
    return this.provider === 'github' ? 'GitHub Token' : 'Personal Access Token';
  }

  tokenPlaceholder(): string {
    return this.provider === 'github' ? 'Enter GitHub token' : 'Enter Azure DevOps PAT';
  }

  configStatusMessage(): string {
    if (this.isSavingConfig()) {
      return 'Saving changes...';
    }

    return 'Loading configuration...';
  }

  addEnvironment(): void {
    if (this.isConfigBusy()) return;

    const name = this.newEnvName.trim().toLowerCase();
    if (!name) return;
    if (this.environments.includes(name)) {
      this.snackBar.open('Environment already exists', 'Close', {
        duration: 2000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    const previousState = this.snapshotConfig();
    this.environments = [...this.environments, name];
    this.newEnvName = '';
    this.persistConfig(previousState, `Environment "${name}" added`);
  }

  removeEnvironment(env: string): void {
    if (this.isConfigBusy()) return;

    const previousState = this.snapshotConfig();
    this.environments = this.environments.filter(existingEnvironment => existingEnvironment !== env);
    this.persistConfig(previousState, `Environment "${env}" removed`);
  }

  addRepositoryProfile(): void {
    if (this.isConfigBusy()) return;

    const repoName = this.newRepositoryName.trim();
    if (!repoName) return;
    if (this.repoProfiles.some(profile => this.repoProfileKey(profile) === repoName.toLowerCase())) {
      this.snackBar.open('Repository profile already exists', 'Close', {
        duration: 2500,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.repoProfiles = [
      ...this.repoProfiles,
      {
        name: repoName,
        type: this.newRepositoryType,
        buildDefinitionId: '',
        deploymentDefinitionId: ''
      }
    ];
    this.newRepositoryName = '';
    this.newRepositoryType = 'service';
    this.repoProfilesDirty = true;
  }

  updateRepoProfile(index: number, field: keyof RepoProfile, value: string): void {
    const nextProfiles = [...this.repoProfiles];
    const current = nextProfiles[index];
    if (!current) {
      return;
    }

    nextProfiles[index] = {
      ...current,
      [field]: value
    };

    if (field === 'type' && value === 'library') {
      nextProfiles[index].deploymentDefinitionId = '';
    }

    this.repoProfiles = nextProfiles;
    this.repoProfilesDirty = true;
  }

  removeRepositoryProfile(index: number): void {
    if (this.isConfigBusy()) return;

    this.repoProfiles = this.repoProfiles.filter((_, profileIndex) => profileIndex !== index);
    this.repoProfilesDirty = true;
  }

  saveRepositoryProfiles(): void {
    if (this.isConfigBusy()) return;

    const validationMessage = this.validateRepoProfiles();
    if (validationMessage) {
      this.snackBar.open(validationMessage, 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.persistConfig(this.cloneState(this.lastSavedState), 'Repository catalog saved');
  }

  close(): void {
    this.dialogRef.close();
  }

  private loadConfig(): void {
    const repoId = this.resolveDbRepoId(this.dbRepoId);
    const branch = this.dbBranch.trim() || 'main';

    if (!repoId) {
      this.configLoaded = false;
      this.loadError = 'Config repo is missing for the selected provider.';
      return;
    }

    this.persistConfigSource(repoId, branch);
    this.dbRepoId = repoId;
    this.dbBranch = branch;
    this.loadError = '';
    this.isLoadingConfig.set(true);

    this.apiService.getConfigData(this.configProvider, repoId, branch)
      .pipe(finalize(() => this.isLoadingConfig.set(false)))
      .subscribe({
        next: response => {
          this.environments = [...response.environments];
          this.repoProfiles = this.normalizeRepoProfiles(response.repoProfiles, response.repositories);
          this.configLoaded = true;
          this.loadError = '';
          this.repoProfilesDirty = false;
          this.lastSavedState = this.snapshotConfig();
        },
        error: () => {
          this.configLoaded = false;
          this.loadError = `Could not load config from ${this.providerName(this.configProvider)}. Check token, organization, repo access, and config provider.`;
        }
      });
  }

  private persistConfig(previousState: ConfigCatalogState, successMessage: string): void {
    if (!this.configLoaded) {
      this.restoreConfig(previousState);
      this.snackBar.open(this.loadError || 'Could not load configuration', 'Close', {
        duration: 2500,
        panelClass: 'error-snackbar'
      });
      return;
    }

    const repoId = this.resolveDbRepoId(this.dbRepoId);
    const branch = this.dbBranch.trim() || 'main';

    if (!repoId) {
      this.restoreConfig(previousState);
      this.snackBar.open('Config repo is missing for the selected provider.', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.persistConfigSource(repoId, branch);
    this.isSavingConfig.set(true);

    this.apiService.saveConfigData(this.configProvider, {
      repoId,
      branch,
      environments: this.environments,
      repositories: this.repositories,
      repoProfiles: this.serializeRepoProfiles()
    }).pipe(finalize(() => this.isSavingConfig.set(false))).subscribe({
      next: () => {
        this.repoProfiles = this.serializeRepoProfiles();
        this.lastSavedState = this.snapshotConfig();
        this.repoProfilesDirty = false;
        this.snackBar.open(successMessage, 'Close', {
          duration: 2000,
          panelClass: 'success-snackbar'
        });
      },
      error: () => {
        this.restoreConfig(previousState);
        this.snackBar.open('Could not save configuration', 'Close', {
          duration: 3000,
          panelClass: 'error-snackbar'
        });
      }
    });
  }

  private snapshotConfig(): ConfigCatalogState {
    return {
      environments: [...this.environments],
      repoProfiles: this.repoProfiles.map(profile => ({ ...profile }))
    };
  }

  private cloneState(state: ConfigCatalogState): ConfigCatalogState {
    return {
      environments: [...state.environments],
      repoProfiles: state.repoProfiles.map(profile => ({ ...profile }))
    };
  }

  private restoreConfig(state: ConfigCatalogState): void {
    this.environments = [...state.environments];
    this.repoProfiles = state.repoProfiles.map(profile => ({ ...profile }));
    this.repoProfilesDirty = false;
  }

  private applyProviderSettings(settings: ProviderSettings): void {
    this.organization = settings.organization;
    this.project = settings.project;
    this.token = settings.pat;
  }

  private persistConfigSource(repoId: string, branch: string): void {
    this.authService.updateDbRepoId(repoId.trim());
    this.authService.updateDbBranch(branch.trim() || 'main');
  }

  private resolveDbRepoId(repoId: string): string {
    const trimmedRepoId = repoId.trim();

    if (trimmedRepoId) {
      return trimmedRepoId;
    }

    if (this.configProvider === 'github') {
      return this.defaultGitHubConfigRepoId;
    }

    return '';
  }

  private normalizeRepoProfiles(repoProfiles: RepoProfile[] | undefined, repositories: string[] | undefined): RepoProfile[] {
    const normalized = new Map<string, RepoProfile>();

    for (const repoProfile of repoProfiles || []) {
      const profile = this.normalizeRepoProfile(repoProfile);
      const key = this.repoProfileKey(profile);
      if (key) {
        normalized.set(key, profile);
      }
    }

    for (const repository of repositories || []) {
      const repoId = repository.trim();
      if (!repoId) {
        continue;
      }

      const fallback = this.normalizeRepoProfile({
        name: repoId,
        type: 'service',
        buildDefinitionId: '',
        deploymentDefinitionId: ''
      });

      const key = this.repoProfileKey(fallback);
      if (!normalized.has(key)) {
        normalized.set(key, fallback);
      }
    }

    return [...normalized.values()];
  }

  private serializeRepoProfiles(): RepoProfile[] {
    const normalized = new Map<string, RepoProfile>();

    for (const repoProfile of this.repoProfiles) {
      const profile = this.normalizeRepoProfile(repoProfile);
      const key = this.repoProfileKey(profile);
      if (key) {
        normalized.set(key, profile);
      }
    }

    return [...normalized.values()];
  }

  private normalizeRepoProfile(repoProfile: RepoProfile): RepoProfile {
    const name = repoProfile.name.trim();
    const type: RepoProfileType = repoProfile.type === 'library' ? 'library' : 'service';

    return {
      name,
      type,
      buildDefinitionId: repoProfile.buildDefinitionId.trim(),
      deploymentDefinitionId: type === 'library' ? '' : repoProfile.deploymentDefinitionId.trim()
    };
  }

  private validateRepoProfiles(): string | null {
    const seenKeys = new Set<string>();

    for (const repoProfile of this.repoProfiles) {
      const profile = this.normalizeRepoProfile(repoProfile);
      const key = this.repoProfileKey(profile);

      if (!profile.name) {
        return 'Each repository needs a name.';
      }

      if (seenKeys.has(key)) {
        return `Repository profile "${profile.name}" is duplicated.`;
      }

      seenKeys.add(key);
    }

    return null;
  }

  private repoProfileKey(repoProfile: RepoProfile): string {
    return repoProfile.name.trim().toLowerCase();
  }
}
