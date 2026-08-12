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
import { AppTabKey, AppTabProviders, Connector, DevOpsProvider, ProviderSettings, RepoProfile, RepoProfileType } from '../../core/models';

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

  configProvider: DevOpsProvider = 'azure';
  appTabs: AppTabKey[] = ['config'];
  tabProviders: AppTabProviders = {
    config: 'azure'
  };
  hideToken = signal(true);
  isLoadingConfig = signal(false);
  isSavingConfig = signal(false);
  isConfigBusy = computed(() => this.isLoadingConfig() || this.isSavingConfig());

  // Connectors
  connectors: Connector[] = [];
  newConnectorName = '';
  newConnectorType: DevOpsProvider = 'azure';
  editingConnectorIndex: number | null = null;
  hideConnectorTokens = signal<Record<number, boolean>>({});

  // Config connector
  configConnectorName = '';
  configRepoName = '';

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

    this.connectors = this.authService.getConnectors();
    this.configConnectorName = this.authService.getConfigConnector();
    this.configRepoName = this.authService.getConfigRepoName();
    this.dbRepoId = config.dbRepoId || this.configRepoName;
    this.dbBranch = config.dbBranch.trim() || 'main';

    const tokenVisibility: Record<number, boolean> = {};
    this.connectors.forEach((_, i) => tokenVisibility[i] = true);
    this.hideConnectorTokens.set(tokenVisibility);

    this.syncConfigFromConnector();
    this.loadConfig();
  }

  // ---- Connectors ----

  addConnector(): void {
    const name = this.newConnectorName.trim();
    if (!name) return;
    if (this.connectors.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open('Connector name already exists', 'Close', { duration: 2000, panelClass: 'error-snackbar' });
      return;
    }

    this.connectors = [
      ...this.connectors,
      { name, type: this.newConnectorType, pat: '', organization: '', project: '' }
    ];
    this.newConnectorName = '';
    this.newConnectorType = 'azure';

    const visibility = { ...this.hideConnectorTokens() };
    visibility[this.connectors.length - 1] = true;
    this.hideConnectorTokens.set(visibility);
  }

  removeConnector(index: number): void {
    const removed = this.connectors[index];
    this.connectors = this.connectors.filter((_, i) => i !== index);
    this.persistConnectors();

    if (this.configConnectorName === removed.name) {
      this.configConnectorName = '';
      this.authService.setConfigConnector('');
    }

    this.snackBar.open(`Connector "${removed.name}" removed`, 'Close', { duration: 2000, panelClass: 'success-snackbar' });
  }

  updateConnectorField(index: number, field: keyof Connector, value: string): void {
    const updated = [...this.connectors];
    updated[index] = { ...updated[index], [field]: value };
    this.connectors = updated;
  }

  saveConnector(index: number): void {
    const connector = this.connectors[index];
    if (!connector.name.trim()) {
      this.snackBar.open('Connector needs a name', 'Close', { duration: 2000, panelClass: 'error-snackbar' });
      return;
    }
    if (!connector.pat.trim()) {
      this.snackBar.open('Token is required', 'Close', { duration: 2000, panelClass: 'error-snackbar' });
      return;
    }
    if (!connector.organization.trim()) {
      this.snackBar.open('Organization is required', 'Close', { duration: 2000, panelClass: 'error-snackbar' });
      return;
    }
    if (connector.type === 'azure' && !connector.project.trim()) {
      this.snackBar.open('Project is required for Azure connectors', 'Close', { duration: 2000, panelClass: 'error-snackbar' });
      return;
    }

    this.persistConnectors();
    this.syncLegacyProviderSettings(connector);

    this.snackBar.open(`Connector "${connector.name}" saved`, 'Close', { duration: 2000, panelClass: 'success-snackbar' });

    if (this.configConnectorName === connector.name) {
      this.syncConfigFromConnector();
      this.loadConfig();
    }
  }

  toggleConnectorToken(index: number): void {
    const visibility = { ...this.hideConnectorTokens() };
    visibility[index] = !visibility[index];
    this.hideConnectorTokens.set(visibility);
  }

  isConnectorTokenHidden(index: number): boolean {
    return this.hideConnectorTokens()[index] !== false;
  }

  connectorTypeLabel(type: DevOpsProvider): string {
    return type === 'github' ? 'GitHub' : 'Azure DevOps';
  }

  connectorTypeIcon(type: DevOpsProvider): string {
    return type === 'github' ? 'code' : 'cloud';
  }

  // ---- Config connector ----

  setConfigConnector(connectorName: string): void {
    this.configConnectorName = connectorName;
    this.authService.setConfigConnector(connectorName);
    this.syncConfigFromConnector();
    this.loadConfig();
  }

  onConfigRepoNameChange(): void {
    this.configRepoName = this.configRepoName.trim();
    this.authService.setConfigRepoName(this.configRepoName);
    this.dbRepoId = this.configRepoName;
    this.persistConfigSource(this.dbRepoId, this.dbBranch);
    this.loadConfig();
  }

  // ---- App Tabs ----

  setAppTabProvider(tab: AppTabKey, provider: DevOpsProvider): void {
    this.tabProviders = { ...this.tabProviders, [tab]: provider };
    this.authService.updateTabProvider(tab, provider);

    if (tab === 'config') {
      this.configProvider = provider;
    }
  }

  isAppTabProviderSelected(tab: AppTabKey, provider: DevOpsProvider): boolean {
    return this.tabProviders[tab] === provider;
  }

  tabLabel(tab: AppTabKey): string {
    return 'Config';
  }

  providerName(provider: DevOpsProvider): string {
    return provider === 'github' ? 'GitHub' : 'Azure DevOps';
  }

  configStatusMessage(): string {
    if (this.isSavingConfig()) return 'Saving changes...';
    return 'Loading configuration...';
  }

  repoTypeLabel(type: RepoProfileType): string {
    return type === 'library' ? 'Library' : 'Service';
  }

  // ---- Environments ----

  addEnvironment(): void {
    if (this.isConfigBusy()) return;
    const name = this.newEnvName.trim().toLowerCase();
    if (!name) return;
    if (this.environments.includes(name)) {
      this.snackBar.open('Environment already exists', 'Close', { duration: 2000, panelClass: 'error-snackbar' });
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
    this.environments = this.environments.filter(e => e !== env);
    this.persistConfig(previousState, `Environment "${env}" removed`);
  }

  // ---- Repository profiles ----

  addRepositoryProfile(): void {
    if (this.isConfigBusy()) return;
    const repoName = this.newRepositoryName.trim();
    if (!repoName) return;
    if (this.repoProfiles.some(p => this.repoProfileKey(p) === repoName.toLowerCase())) {
      this.snackBar.open('Repository profile already exists', 'Close', { duration: 2500, panelClass: 'error-snackbar' });
      return;
    }

    this.repoProfiles = [
      ...this.repoProfiles,
      { name: repoName, type: this.newRepositoryType, buildDefinitionId: '', deploymentDefinitionId: '' }
    ];
    this.newRepositoryName = '';
    this.newRepositoryType = 'service';
    this.repoProfilesDirty = true;
  }

  updateRepoProfile(index: number, field: keyof RepoProfile, value: string): void {
    const nextProfiles = [...this.repoProfiles];
    const current = nextProfiles[index];
    if (!current) return;
    nextProfiles[index] = { ...current, [field]: value };
    if (field === 'type' && value === 'library') {
      nextProfiles[index].deploymentDefinitionId = '';
    }
    this.repoProfiles = nextProfiles;
    this.repoProfilesDirty = true;
  }

  removeRepositoryProfile(index: number): void {
    if (this.isConfigBusy()) return;
    this.repoProfiles = this.repoProfiles.filter((_, i) => i !== index);
    this.repoProfilesDirty = true;
  }

  saveRepositoryProfiles(): void {
    if (this.isConfigBusy()) return;
    const validationMessage = this.validateRepoProfiles();
    if (validationMessage) {
      this.snackBar.open(validationMessage, 'Close', { duration: 3000, panelClass: 'error-snackbar' });
      return;
    }
    this.persistConfig(this.cloneState(this.lastSavedState), 'Repository catalog saved');
  }

  close(): void {
    this.dialogRef.close();
  }

  // ---- Private ----

  private syncConfigFromConnector(): void {
    const connector = this.connectors.find(c => c.name === this.configConnectorName);
    if (connector) {
      this.configProvider = connector.type;
      this.authService.updateTabProvider('config', connector.type);
      this.tabProviders = { ...this.tabProviders, config: connector.type };

      this.authService.updateProviderSettings(connector.type, {
        pat: connector.pat,
        organization: connector.organization,
        project: connector.project
      });

      if (!this.configRepoName && connector.type === 'github') {
        this.configRepoName = this.defaultGitHubConfigRepoId;
      }
      this.dbRepoId = this.configRepoName || (connector.type === 'github' ? this.defaultGitHubConfigRepoId : '');
      this.persistConfigSource(this.dbRepoId, this.dbBranch);
    }
  }

  private syncLegacyProviderSettings(connector: Connector): void {
    this.authService.updateProviderSettings(connector.type, {
      pat: connector.pat,
      organization: connector.organization,
      project: connector.project
    });
  }

  private persistConnectors(): void {
    this.authService.saveConnectors(this.connectors);
  }

  private loadConfig(): void {
    const repoId = this.dbRepoId.trim();
    const branch = this.dbBranch.trim() || 'main';

    if (!repoId || !this.configConnectorName) {
      this.configLoaded = false;
      this.loadError = !this.configConnectorName
        ? 'Select a connector for config access.'
        : 'Config repo name is required.';
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
          this.repoProfiles = this.normalizeRepoProfiles(response.repoProfiles);
          this.configLoaded = true;
          this.loadError = '';
          this.repoProfilesDirty = false;
          this.lastSavedState = this.snapshotConfig();
        },
        error: () => {
          this.configLoaded = false;
          this.loadError = 'Could not load config. Check connector credentials and repo access.';
        }
      });
  }

  private persistConfig(previousState: ConfigCatalogState, successMessage: string): void {
    if (!this.configLoaded) {
      this.restoreConfig(previousState);
      this.snackBar.open(this.loadError || 'Could not load configuration', 'Close', { duration: 2500, panelClass: 'error-snackbar' });
      return;
    }

    const repoId = this.dbRepoId.trim();
    const branch = this.dbBranch.trim() || 'main';

    if (!repoId) {
      this.restoreConfig(previousState);
      this.snackBar.open('Config repo name is required.', 'Close', { duration: 3000, panelClass: 'error-snackbar' });
      return;
    }

    this.persistConfigSource(repoId, branch);
    this.isSavingConfig.set(true);

    this.apiService.saveConfigData(this.configProvider, {
      repoId,
      branch,
      environments: this.environments,
      repoProfiles: this.serializeRepoProfiles()
    }).pipe(finalize(() => this.isSavingConfig.set(false))).subscribe({
      next: () => {
        this.repoProfiles = this.serializeRepoProfiles();
        this.lastSavedState = this.snapshotConfig();
        this.repoProfilesDirty = false;
        this.snackBar.open(successMessage, 'Close', { duration: 2000, panelClass: 'success-snackbar' });
      },
      error: () => {
        this.restoreConfig(previousState);
        this.snackBar.open('Could not save configuration', 'Close', { duration: 3000, panelClass: 'error-snackbar' });
      }
    });
  }

  private snapshotConfig(): ConfigCatalogState {
    return {
      environments: [...this.environments],
      repoProfiles: this.repoProfiles.map(p => ({ ...p }))
    };
  }

  private cloneState(state: ConfigCatalogState): ConfigCatalogState {
    return {
      environments: [...state.environments],
      repoProfiles: state.repoProfiles.map(p => ({ ...p }))
    };
  }

  private restoreConfig(state: ConfigCatalogState): void {
    this.environments = [...state.environments];
    this.repoProfiles = state.repoProfiles.map(p => ({ ...p }));
    this.repoProfilesDirty = false;
  }

  private persistConfigSource(repoId: string, branch: string): void {
    this.authService.updateDbRepoId(repoId.trim());
    this.authService.updateDbBranch(branch.trim() || 'main');
  }

  private normalizeRepoProfiles(repoProfiles: RepoProfile[] | undefined): RepoProfile[] {
    const normalized = new Map<string, RepoProfile>();
    for (const rp of repoProfiles || []) {
      const profile = this.normalizeRepoProfile(rp);
      const key = this.repoProfileKey(profile);
      if (key) normalized.set(key, profile);
    }
    return [...normalized.values()];
  }

  private serializeRepoProfiles(): RepoProfile[] {
    const normalized = new Map<string, RepoProfile>();
    for (const rp of this.repoProfiles) {
      const profile = this.normalizeRepoProfile(rp);
      const key = this.repoProfileKey(profile);
      if (key) normalized.set(key, profile);
    }
    return [...normalized.values()];
  }

  private normalizeRepoProfile(rp: RepoProfile): RepoProfile {
    const name = rp.name.trim();
    const type: RepoProfileType = rp.type === 'library' ? 'library' : 'service';
    return {
      name,
      type,
      buildDefinitionId: rp.buildDefinitionId.trim(),
      deploymentDefinitionId: type === 'library' ? '' : rp.deploymentDefinitionId.trim()
    };
  }

  private validateRepoProfiles(): string | null {
    const seenKeys = new Set<string>();
    for (const rp of this.repoProfiles) {
      const profile = this.normalizeRepoProfile(rp);
      const key = this.repoProfileKey(profile);
      if (!profile.name) return 'Each repository needs a name.';
      if (seenKeys.has(key)) return `Repository profile "${profile.name}" is duplicated.`;
      seenKeys.add(key);
    }
    return null;
  }

  private repoProfileKey(rp: RepoProfile): string {
    return rp.name.trim().toLowerCase();
  }
}
