import { Component, signal, OnInit } from '@angular/core';
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
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

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
  azurePat = '';
  githubPat = '';
  hideAzurePat = signal(true);
  hideGithubPat = signal(true);

  environments: string[] = [];
  repositories: string[] = [];
  newEnvName = '';
  newRepositoryName = '';
  dbRepoId = '';
  dbBranch = 'main';
  configLoaded = false;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private dialogRef: MatDialogRef<ConfigDialogComponent>,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const config = this.authService.getConfig();
    this.azurePat = config.azurePat;
    this.githubPat = config.githubPat;
    this.dbRepoId = config.dbRepoId;
    this.dbBranch = config.dbBranch;

    this.loadConfig();
  }

  saveAzurePat(): void {
    this.authService.updateAzurePat(this.azurePat);
    this.snackBar.open('Azure PAT updated', 'Close', {
      duration: 2000,
      panelClass: 'success-snackbar'
    });
  }

  saveGithubPat(): void {
    this.authService.updateGithubPat(this.githubPat);
    this.snackBar.open('GitHub PAT updated', 'Close', {
      duration: 2000,
      panelClass: 'success-snackbar'
    });
  }

  addEnvironment(): void {
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
    const previousState = this.snapshotConfig();
    this.environments = this.environments.filter(existingEnvironment => existingEnvironment !== env);
    this.persistConfig(previousState, `Environment "${env}" removed`);
  }

  addRepository(): void {
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
    const previousState = this.snapshotConfig();
    this.repositories = this.repositories.filter(existingRepository => existingRepository !== repository);
    this.persistConfig(previousState, `Repository "${repository}" removed`);
  }

  close(): void {
    this.dialogRef.close();
  }

  private loadConfig(): void {
    this.apiService.getConfigData(this.dbRepoId, this.dbBranch).subscribe({
      next: (response) => {
        this.environments = [...response.environments];
        this.repositories = [...response.repositories];
        this.configLoaded = true;
      },
      error: () => {
        this.configLoaded = false;
      }
    });
  }

  private persistConfig(
    previousState: { environments: string[]; repositories: string[] },
    successMessage: string
  ): void {
    if (!this.configLoaded) {
      this.restoreConfig(previousState);
      this.snackBar.open('Could not load configuration', 'Close', {
        duration: 2500,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.apiService.saveConfigData({
      repoId: this.dbRepoId,
      branch: this.dbBranch.trim() || 'main',
      environments: this.environments,
      repositories: this.repositories
    }).subscribe({
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
}
