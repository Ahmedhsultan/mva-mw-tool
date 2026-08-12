import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { AppTabKey, AppTabProviders, AuthRequest, AuthResponse, Connector, DevOpsConfig, DevOpsProvider, ProviderSettings } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _isAuthenticated = signal(this.hasStoredSession());
  private readonly _provider = signal<DevOpsProvider>(this.getStoredProvider());
  private readonly _displayName = signal(sessionStorage.getItem('mva_displayName') || '');
  private readonly _avatarUrl = signal(sessionStorage.getItem('mva_avatarUrl') || '');
  private readonly _organization = signal(sessionStorage.getItem('mva_organization') || '');
  private readonly _project = signal(sessionStorage.getItem('mva_project') || '');

  readonly isAuthenticated = this._isAuthenticated.asReadonly();
  readonly provider = this._provider.asReadonly();
  readonly displayName = this._displayName.asReadonly();
  readonly avatarUrl = this._avatarUrl.asReadonly();
  readonly organization = this._organization.asReadonly();
  readonly project = this._project.asReadonly();

  constructor(private http: HttpClient, private router: Router) {}

  validateToken(provider: DevOpsProvider, pat: string, organization: string, project: string): Observable<AuthResponse> {
    const request: AuthRequest = {
      pat,
      provider,
      organization,
      project
    };

    return this.http.post<AuthResponse>('/api/auth/validate', request).pipe(
      tap(response => {
        if (response.valid) {
          this.updateProviderSettings(provider, {
            pat,
            organization,
            project
          });
          this.updateProvider(provider);
          sessionStorage.setItem('mva_displayName', response.displayName || '');
          sessionStorage.setItem('mva_avatarUrl', response.avatarUrl || '');
          this._isAuthenticated.set(true);
          this._displayName.set(response.displayName || '');
          this._avatarUrl.set(response.avatarUrl || '');
        }
      }),
      catchError(err => {
        return of({ valid: false, displayName: '', email: '' } as AuthResponse);
      })
    );
  }

  logout(): void {
    sessionStorage.removeItem('mva_azurePat');
    sessionStorage.removeItem('mva_githubPat');
    sessionStorage.removeItem('mva_azureConfigPat');
    sessionStorage.removeItem('mva_githubConfigPat');
    sessionStorage.removeItem('mva_organization');
    sessionStorage.removeItem('mva_project');
    sessionStorage.removeItem('mva_azureOrganization');
    sessionStorage.removeItem('mva_azureProject');
    sessionStorage.removeItem('mva_githubOrganization');
    sessionStorage.removeItem('mva_githubProject');
    sessionStorage.removeItem('mva_azureConfigOrganization');
    sessionStorage.removeItem('mva_azureConfigProject');
    sessionStorage.removeItem('mva_githubConfigOrganization');
    sessionStorage.removeItem('mva_githubConfigProject');
    sessionStorage.removeItem('mva_displayName');
    sessionStorage.removeItem('mva_avatarUrl');
    sessionStorage.removeItem('mva_provider');
    sessionStorage.removeItem('mva_dbRepoId');
    sessionStorage.removeItem('mva_dbBranch');
    sessionStorage.removeItem('mva_overview_provider');
    sessionStorage.removeItem('mva_builds_provider');
    sessionStorage.removeItem('mva_deployments_provider');
    sessionStorage.removeItem('mva_pipelines_provider');
    sessionStorage.removeItem('mva_config_provider');
    sessionStorage.removeItem('mva_config_connector_id');
    sessionStorage.removeItem('mva_connectors');
    sessionStorage.removeItem('mva_configDone');
    this._isAuthenticated.set(false);
    this._provider.set('azure');
    this._displayName.set('');
    this._organization.set('');
    this._project.set('');
    this.router.navigate(['/login']);
  }

  getConfig(): DevOpsConfig {
    const provider = this.getStoredProvider();
    const activeSettings = this.getProviderSettings(provider);

    return {
      provider,
      azurePat: sessionStorage.getItem('mva_azurePat') || '',
      githubPat: sessionStorage.getItem('mva_githubPat') || '',
      azureOrganization: this.getStoredOrganization('azure'),
      azureProject: this.getStoredProject('azure'),
      githubOrganization: this.getStoredOrganization('github'),
      githubProject: this.getStoredProject('github'),
      organization: activeSettings.organization,
      project: activeSettings.project,
      connectors: this.getConnectors(),
      configConnectorId: this.getStoredConfigConnectorId(),
      environments: [],
      dbRepoId: sessionStorage.getItem('mva_dbRepoId') || '',
      dbBranch: sessionStorage.getItem('mva_dbBranch') || 'main',
      tabProviders: this.getTabProviders()
    };
  }

  updateAzurePat(pat: string): void {
    sessionStorage.setItem('mva_azurePat', pat);
  }

  updateGithubPat(pat: string): void {
    sessionStorage.setItem('mva_githubPat', pat);
  }

  updateProvider(provider: DevOpsProvider): void {
    sessionStorage.setItem('mva_provider', provider);
    this._provider.set(provider);
    this.syncActiveContext(provider);
  }

  getProviderSettings(provider: DevOpsProvider): ProviderSettings {
    return {
      pat: provider === 'github'
        ? sessionStorage.getItem('mva_githubPat') || ''
        : sessionStorage.getItem('mva_azurePat') || '',
      organization: this.getStoredOrganization(provider),
      project: provider === 'github' ? '' : this.getStoredProject(provider)
    };
  }

  updateProviderSettings(provider: DevOpsProvider, settings: ProviderSettings): void {
    if (provider === 'github') {
      sessionStorage.setItem('mva_githubPat', settings.pat);
      sessionStorage.setItem('mva_githubOrganization', settings.organization);
      // GitHub connectors do not store a project value; repo name will be used per-step
    } else {
      sessionStorage.setItem('mva_azurePat', settings.pat);
      sessionStorage.setItem('mva_azureOrganization', settings.organization);
      sessionStorage.setItem('mva_azureProject', settings.project);
    }

    if (this.getStoredProvider() === provider) {
      this.syncActiveContext(provider);
    }
  }

  getProviderConfigSettings(provider: DevOpsProvider): ProviderSettings {
    const configConnectorId = this.getStoredConfigConnectorId();
    const connector = this.getConnector(configConnectorId);

    if (connector) {
      return {
        pat: connector.pat,
        organization: connector.organization,
        project: provider === 'github' ? '' : connector.project
      };
    }

    return {
      pat: provider === 'github'
        ? sessionStorage.getItem('mva_githubConfigPat') || sessionStorage.getItem('mva_githubPat') || ''
        : sessionStorage.getItem('mva_azureConfigPat') || sessionStorage.getItem('mva_azurePat') || '',
      organization: this.getStoredConfigOrganization(provider),
      project: this.getStoredConfigProject(provider)
    };
  }

  updateProviderConfigSettings(provider: DevOpsProvider, settings: ProviderSettings): void {
    if (provider === 'github') {
      sessionStorage.setItem('mva_githubConfigPat', settings.pat);
      sessionStorage.setItem('mva_githubConfigOrganization', settings.organization);
      // Do not persist a project for GitHub config connectors
    } else {
      sessionStorage.setItem('mva_azureConfigPat', settings.pat);
      sessionStorage.setItem('mva_azureConfigOrganization', settings.organization);
      sessionStorage.setItem('mva_azureConfigProject', settings.project);
    }
  }

  getConnectors(): Connector[] {
    try {
      const payload = sessionStorage.getItem('mva_connectors');
      if (!payload) {
        return [];
      }
      return JSON.parse(payload) as Connector[];
    } catch {
      return [];
    }
  }

  getConnector(connectorId: string): Connector | undefined {
    if (!connectorId) {
      return undefined;
    }
    return this.getConnectors().find(connector => connector.id === connectorId);
  }

  saveConnectors(connectors: Connector[]): void {
    sessionStorage.setItem('mva_connectors', JSON.stringify(connectors || []));
  }

  updateConfigConnectorId(connectorId: string): void {
    sessionStorage.setItem('mva_config_connector_id', connectorId || '');
  }

  getStoredConfigConnectorId(): string {
    return sessionStorage.getItem('mva_config_connector_id') || '';
  }

  updateOrganization(org: string): void {
    this.updateProviderSettings(this.getStoredProvider(), {
      ...this.getProviderSettings(this.getStoredProvider()),
      organization: org
    });
  }

  updateProject(project: string): void {
    this.updateProviderSettings(this.getStoredProvider(), {
      ...this.getProviderSettings(this.getStoredProvider()),
      project
    });
  }

  updateDbRepoId(repoId: string): void {
    sessionStorage.setItem('mva_dbRepoId', repoId);
  }

  updateDbBranch(branch: string): void {
    sessionStorage.setItem('mva_dbBranch', branch);
  }

  getTabProviders(): AppTabProviders {
    const fallback = this.getStoredProvider();
    return {
      config: this.getStoredTabProvider('config', fallback)
    };
  }

  getTabProvider(tab: AppTabKey): DevOpsProvider {
    return this.getTabProviders()[tab];
  }

  updateTabProvider(tab: AppTabKey, provider: DevOpsProvider): void {
    sessionStorage.setItem(this.tabProviderStorageKey(tab), provider);
  }

  private hasStoredSession(): boolean {
    const provider = this.getStoredProvider();
    const patKey = provider === 'github' ? 'mva_githubPat' : 'mva_azurePat';
    return !!sessionStorage.getItem(patKey);
  }

  private getStoredProvider(): DevOpsProvider {
    const storedProvider = sessionStorage.getItem('mva_provider');
    if (storedProvider === 'azure' || storedProvider === 'github') {
      return storedProvider;
    }

    if (sessionStorage.getItem('mva_githubPat') && !sessionStorage.getItem('mva_azurePat')) {
      return 'github';
    }

    return 'azure';
  }

  private getStoredTabProvider(tab: AppTabKey, fallback: DevOpsProvider): DevOpsProvider {
    const storedProvider = sessionStorage.getItem(this.tabProviderStorageKey(tab));
    if (storedProvider === 'azure' || storedProvider === 'github') {
      return storedProvider;
    }

    return fallback;
  }

  private tabProviderStorageKey(tab: AppTabKey): string {
    return `mva_${tab}_provider`;
  }

  private syncActiveContext(provider: DevOpsProvider): void {
    const settings = this.getProviderSettings(provider);
    sessionStorage.setItem('mva_organization', settings.organization);
    sessionStorage.setItem('mva_project', settings.project);
    this._organization.set(settings.organization);
    this._project.set(settings.project);
  }

  private getStoredOrganization(provider: DevOpsProvider): string {
    const providerKey = provider === 'github' ? 'mva_githubOrganization' : 'mva_azureOrganization';
    return sessionStorage.getItem(providerKey) || sessionStorage.getItem('mva_organization') || '';
  }

  private getStoredProject(provider: DevOpsProvider): string {
    if (provider === 'github') {
      // GitHub does not use a project value in connectors; return empty
      return '';
    }

    const providerKey = 'mva_azureProject';
    return sessionStorage.getItem(providerKey) || sessionStorage.getItem('mva_project') || '';
  }

  private getStoredConfigOrganization(provider: DevOpsProvider): string {
    const providerKey = provider === 'github' ? 'mva_githubConfigOrganization' : 'mva_azureConfigOrganization';
    return sessionStorage.getItem(providerKey) || this.getStoredOrganization(provider);
  }

  private getStoredConfigProject(provider: DevOpsProvider): string {
    if (provider === 'github') {
      return '';
    }

    const providerKey = 'mva_azureConfigProject';
    return sessionStorage.getItem(providerKey) || this.getStoredProject(provider);
  }
}
