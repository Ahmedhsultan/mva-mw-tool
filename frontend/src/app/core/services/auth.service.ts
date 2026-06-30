import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { AuthRequest, AuthResponse, DevOpsConfig } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _isAuthenticated = signal(this.hasStoredSession());
  private readonly _displayName = signal(sessionStorage.getItem('mva_displayName') || '');
  private readonly _organization = signal(sessionStorage.getItem('mva_organization') || '');
  private readonly _project = signal(sessionStorage.getItem('mva_project') || '');

  readonly isAuthenticated = this._isAuthenticated.asReadonly();
  readonly displayName = this._displayName.asReadonly();
  readonly organization = this._organization.asReadonly();
  readonly project = this._project.asReadonly();

  constructor(private http: HttpClient, private router: Router) {}

  validateToken(pat: string, organization: string, project: string): Observable<AuthResponse> {
    const request: AuthRequest = {
      pat,
      provider: 'azure',
      organization,
      project
    };

    return this.http.post<AuthResponse>('/api/auth/validate', request).pipe(
      tap(response => {
        if (response.valid) {
          sessionStorage.setItem('mva_azurePat', pat);
          sessionStorage.setItem('mva_organization', organization);
          sessionStorage.setItem('mva_project', project);
          sessionStorage.setItem('mva_displayName', response.displayName || '');
          this._isAuthenticated.set(true);
          this._displayName.set(response.displayName || '');
          this._organization.set(organization);
          this._project.set(project);
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
    sessionStorage.removeItem('mva_organization');
    sessionStorage.removeItem('mva_project');
    sessionStorage.removeItem('mva_displayName');
    sessionStorage.removeItem('mva_environments');
    this._isAuthenticated.set(false);
    this._displayName.set('');
    this._organization.set('');
    this._project.set('');
    this.router.navigate(['/login']);
  }

  getConfig(): DevOpsConfig {
    return {
      azurePat: sessionStorage.getItem('mva_azurePat') || '',
      githubPat: sessionStorage.getItem('mva_githubPat') || '',
      organization: sessionStorage.getItem('mva_organization') || '',
      project: sessionStorage.getItem('mva_project') || '',
      environments: JSON.parse(sessionStorage.getItem('mva_environments') || '["dev","staging","prod"]')
    };
  }

  updateAzurePat(pat: string): void {
    sessionStorage.setItem('mva_azurePat', pat);
  }

  updateGithubPat(pat: string): void {
    sessionStorage.setItem('mva_githubPat', pat);
  }

  updateOrganization(org: string): void {
    sessionStorage.setItem('mva_organization', org);
  }

  updateProject(project: string): void {
    sessionStorage.setItem('mva_project', project);
  }

  getEnvironments(): string[] {
    return JSON.parse(sessionStorage.getItem('mva_environments') || '["dev","staging","prod"]');
  }

  setEnvironments(envs: string[]): void {
    sessionStorage.setItem('mva_environments', JSON.stringify(envs));
  }

  private hasStoredSession(): boolean {
    return !!sessionStorage.getItem('mva_azurePat');
  }
}
