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

  constructor(
    private authService: AuthService,
    private dialogRef: MatDialogRef<ConfigDialogComponent>,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const config = this.authService.getConfig();
    this.azurePat = config.azurePat;
    this.githubPat = config.githubPat;
    this.environments = [...config.environments];
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
    this.environments.push(name);
    this.authService.setEnvironments(this.environments);
    this.newEnvName = '';
    this.snackBar.open(`Environment "${name}" added`, 'Close', {
      duration: 2000,
      panelClass: 'success-snackbar'
    });
  }

  removeEnvironment(env: string): void {
    this.environments = this.environments.filter(e => e !== env);
    this.authService.setEnvironments(this.environments);
    this.snackBar.open(`Environment "${env}" removed`, 'Close', {
      duration: 2000,
      panelClass: 'success-snackbar'
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
