import { Component, computed, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppTabKey, AppTabProviders, DevOpsProvider, ProviderSettings } from '../../core/models';

@Component({
  selector: 'app-config-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
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
  appTabs: AppTabKey[] = ['overview', 'builds', 'deployments', 'config'];
  tabProviders: AppTabProviders = {
    overview: 'azure',
    builds: 'azure',
    deployments: 'azure',
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
  repositories: string[] = [];
  newEnvName = '';
  newRepositoryName = '';
  dbRepoId = '';
  dbBranch = 'main';
  configLoaded = false;
  loadError = '';

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

    this.loadConfig();
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
      case 'builds':
        return 'Builds';
      case 'deployments':
        return 'Deployments';
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

  addRepository(): void {
    if (this.isConfigBusy()) return;

    const name = this.newRepositoryName.trim();
    if (!name) return;
    if (this.repositories.some(repository => repository.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open('Repository already exists', 'Close', {
        duration: 2500,
        panelClass: 'error-snackbar'
      });
      return;
    }

    const previousState = this.snapshotConfig();
    this.repositories = [...this.repositories, name];
    this.newRepositoryName = '';
    this.persistConfig(previousState, `Repository "${name}" added`);
  }

  removeRepository(repository: string): void {
    if (this.isConfigBusy()) return;

    const previousState = this.snapshotConfig();
    this.repositories = this.repositories.filter(existingRepository => existingRepository !== repository);
    this.persistConfig(previousState, `Repository "${repository}" removed`);
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

    this.dbRepoId = repoId;
    this.dbBranch = branch;
    this.loadError = '';
    this.isLoadingConfig.set(true);

    this.apiService.getConfigData(this.configProvider, repoId, branch)
      .pipe(finalize(() => this.isLoadingConfig.set(false)))
      .subscribe({
      next: (response) => {
        this.environments = [...response.environments];
        this.repositories = [...response.repositories];
        this.configLoaded = true;
        this.loadError = '';
      },
      error: () => {
        this.configLoaded = false;
        this.loadError = `Could not load config from ${this.providerName(this.configProvider)}. Check token, organization, repo access, and config provider.`;
      }
    });
  }

  private persistConfig(
    previousState: { environments: string[]; repositories: string[] },
    successMessage: string
  ): void {
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

    this.isSavingConfig.set(true);

    this.apiService.saveConfigData(this.configProvider, {
      repoId,
      branch,
      environments: this.environments,
      repositories: this.repositories
    }).pipe(finalize(() => this.isSavingConfig.set(false))).subscribe({
      next: () => {
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

  private snapshotConfig(): { environments: string[]; repositories: string[] } {
    return {
      environments: [...this.environments],
      repositories: [...this.repositories]
    };
  }

  private restoreConfig(state: { environments: string[]; repositories: string[] }): void {
    this.environments = [...state.environments];
    this.repositories = [...state.repositories];
  }

  private applyProviderSettings(settings: ProviderSettings): void {
    this.organization = settings.organization;
    this.project = settings.project;
    this.token = settings.pat;
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
}
