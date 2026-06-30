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
  newEnvName = '';
  dbRepoId = '';
  dbBranch = 'main';

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
    this.environments = [...config.environments];
    this.dbRepoId = config.dbRepoId;
    this.dbBranch = config.dbBranch;

    if (this.hasDatabaseSource()) {
      this.loadEnvironmentsFromRepo();
    }
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
    const previousEnvironments = [...this.environments];
    this.environments = [...this.environments, name];
    this.newEnvName = '';
    this.persistEnvironments(previousEnvironments, `Environment "${name}" added`);
  }

  removeEnvironment(env: string): void {
    const previousEnvironments = [...this.environments];
    this.environments = this.environments.filter(existingEnvironment => existingEnvironment !== env);
    this.persistEnvironments(previousEnvironments, `Environment "${env}" removed`);
  }

  saveDatabaseSource(): void {
    const repoId = this.dbRepoId.trim();
    const branch = this.dbBranch.trim() || 'main';

    if (!repoId) {
      this.snackBar.open('Enter the Azure repo name or id', 'Close', {
        duration: 2500,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.dbRepoId = repoId;
    this.dbBranch = branch;
    this.authService.updateDbRepoId(repoId);
    this.authService.updateDbBranch(branch);
    this.loadEnvironmentsFromRepo(true, true);
  }

  close(): void {
    this.dialogRef.close();
  }

  private hasDatabaseSource(): boolean {
    return this.dbRepoId.trim().length > 0 && this.dbBranch.trim().length > 0;
  }

  private loadEnvironmentsFromRepo(showSuccess = false, showError = false): void {
    this.apiService.getConfigEnvironments(this.dbRepoId, this.dbBranch).subscribe({
      next: (response) => {
        this.environments = [...response.environments];

        if (showSuccess) {
          this.snackBar.open('Loaded environments from repo', 'Close', {
            duration: 2000,
            panelClass: 'success-snackbar'
          });
        }
      },
      error: () => {
        if (showError) {
          this.snackBar.open('Could not load db/config/environments.json from repo', 'Close', {
            duration: 3000,
            panelClass: 'error-snackbar'
          });
        }
      }
    });
  }

  private persistEnvironments(previousEnvironments: string[], successMessage: string): void {
    if (!this.hasDatabaseSource()) {
      this.environments = [...previousEnvironments];
      this.snackBar.open('Set repo and branch first', 'Close', {
        duration: 2500,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.apiService.saveConfigEnvironments({
      repoId: this.dbRepoId,
      branch: this.dbBranch,
      environments: this.environments
    }).subscribe({
      next: () => {
        this.snackBar.open(successMessage, 'Close', {
          duration: 2000,
          panelClass: 'success-snackbar'
        });
      },
      error: () => {
        this.environments = [...previousEnvironments];
        this.snackBar.open('Could not sync environments to repo', 'Close', {
          duration: 3000,
          panelClass: 'error-snackbar'
        });
      }
    });
  }
}
