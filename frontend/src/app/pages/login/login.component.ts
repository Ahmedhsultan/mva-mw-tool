import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../core/services/auth.service';
import { Connector, ProviderSettings } from '../../core/models';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatCheckboxModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  // Azure fields
  azureOrganization = '';
  azureProject = '';
  azurePat = '';
  hideAzurePassword = signal(true);
  azureValid = signal<boolean | null>(null);

  // GitHub fields
  githubOrganization = '';
  githubProject = '';
  githubPat = '';
  hideGithubPassword = signal(true);
  githubValid = signal<boolean | null>(null);

  rememberMe = false;
  loading = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    // Load saved credentials from localStorage if remembered
    const saved = localStorage.getItem('mva_remember');
    if (saved) {
      try {
        const creds = JSON.parse(saved);
        this.azureOrganization = creds.azureOrganization || '';
        this.azureProject = creds.azureProject || '';
        this.azurePat = creds.azurePat || '';
        this.githubOrganization = creds.githubOrganization || '';
        this.githubProject = creds.githubProject || '';
        this.githubPat = creds.githubPat || '';
        this.rememberMe = true;
      } catch { /* ignore */ }
    } else {
      const azureSettings = this.authService.getProviderSettings('azure');
      this.azureOrganization = azureSettings.organization;
      this.azureProject = azureSettings.project;
      this.azurePat = azureSettings.pat;

      const githubSettings = this.authService.getProviderSettings('github');
      this.githubOrganization = githubSettings.organization;
      this.githubProject = githubSettings.project;
      this.githubPat = githubSettings.pat;
    }
  }

  login(): void {
    if (!this.azurePat || !this.azureOrganization || !this.azureProject) {
      this.snackBar.open('Please fill in all Azure DevOps fields', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    if (!this.githubPat || !this.githubOrganization) {
      this.snackBar.open('Please fill in all GitHub fields', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.loading.set(true);
    this.azureValid.set(null);
    this.githubValid.set(null);

    const azure$ = this.authService.validateToken('azure', this.azurePat, this.azureOrganization, this.azureProject);
    const github$ = this.authService.validateToken('github', this.githubPat, this.githubOrganization, this.githubProject);

    forkJoin({ azure: azure$, github: github$ }).subscribe({
      next: ({ azure, github }) => {
        this.loading.set(false);
        this.azureValid.set(azure.valid);
        this.githubValid.set(github.valid);

        if (!azure.valid && !github.valid) {
          this.snackBar.open('Both tokens are invalid. Please check your credentials.', 'Close', {
            duration: 5000, panelClass: 'error-snackbar'
          });
        } else if (!azure.valid) {
          this.snackBar.open('Azure DevOps token is invalid.', 'Close', {
            duration: 5000, panelClass: 'error-snackbar'
          });
        } else if (!github.valid) {
          this.snackBar.open('GitHub token is invalid.', 'Close', {
            duration: 5000, panelClass: 'error-snackbar'
          });
        } else {
          // Both valid
          this.persistRememberMe();
          this.seedDefaultConnectors();
          this.snackBar.open(`Welcome, ${azure.displayName}!`, 'Close', {
            duration: 3000, panelClass: 'success-snackbar'
          });
          this.router.navigate(['/dashboard']);
        }
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Connection error. Please try again.', 'Close', {
          duration: 5000, panelClass: 'error-snackbar'
        });
      }
    });
  }

  private persistRememberMe(): void {
    if (this.rememberMe) {
      localStorage.setItem('mva_remember', JSON.stringify({
        azureOrganization: this.azureOrganization.trim(),
        azureProject: this.azureProject.trim(),
        azurePat: this.azurePat.trim(),
        githubOrganization: this.githubOrganization.trim(),
        githubProject: this.githubProject.trim(),
        githubPat: this.githubPat.trim()
      }));
    } else {
      localStorage.removeItem('mva_remember');
    }
  }

  private seedDefaultConnectors(): void {
    const existing = this.authService.getConnectors();
    if (existing.length) return;

    const connectors: Connector[] = [
      {
        name: 'Azure DevOps',
        type: 'azure',
        pat: this.azurePat.trim(),
        organization: this.azureOrganization.trim(),
        project: this.azureProject.trim()
      },
      {
        name: 'GitHub',
        type: 'github',
        pat: this.githubPat.trim(),
        organization: this.githubOrganization.trim(),
        project: ''
      }
    ];
    this.authService.saveConnectors(connectors);
  }
}
