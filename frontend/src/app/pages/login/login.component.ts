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
import { AuthService } from '../../core/services/auth.service';
import { DevOpsProvider, ProviderSettings } from '../../core/models';

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
    MatSnackBarModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  provider: DevOpsProvider;
  pat = '';
  organization = '';
  project = '';
  hidePassword = signal(true);
  loading = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    const config = this.authService.getConfig();
    this.provider = config.provider;
    this.applyProviderSettings(this.authService.getProviderSettings(this.provider));
  }

  selectProvider(provider: DevOpsProvider): void {
    this.provider = provider;
    this.applyProviderSettings(this.authService.getProviderSettings(provider));
  }

  isProviderSelected(provider: DevOpsProvider): boolean {
    return this.provider === provider;
  }

  providerLabel(): string {
    return this.provider === 'github' ? 'GitHub' : 'Azure DevOps';
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
    return this.provider === 'github' ? 'Paste your GitHub token' : 'Paste your PAT here';
  }

  providerHelpUrl(): string {
    return this.provider === 'github'
      ? 'https://github.com/settings/tokens'
      : 'https://dev.azure.com';
  }

  providerHelpText(): string {
    return this.provider === 'github'
      ? 'Need a token? Create one in GitHub Settings → Developer settings → Personal access tokens.'
      : 'Need a PAT? Create one in Azure DevOps from User Settings → Personal Access Tokens.';
  }

  private applyProviderSettings(settings: ProviderSettings): void {
    this.organization = settings.organization;
    this.project = settings.project;
    this.pat = settings.pat;
  }

  togglePasswordVisibility(): void {
    this.hidePassword.update(v => !v);
  }

  login(): void {
    if (!this.pat || !this.organization || (this.provider === 'azure' && !this.project)) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.loading.set(true);
    this.authService.validateToken(this.provider, this.pat, this.organization, this.project).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response.valid) {
          this.snackBar.open(`Welcome, ${response.displayName}!`, 'Close', {
            duration: 3000,
            panelClass: 'success-snackbar'
          });
          this.router.navigate(['/dashboard']);
        } else {
          this.snackBar.open('Invalid PAT token. Please check and try again.', 'Close', {
            duration: 5000,
            panelClass: 'error-snackbar'
          });
        }
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Connection error. Please try again.', 'Close', {
          duration: 5000,
          panelClass: 'error-snackbar'
        });
      }
    });
  }
}
