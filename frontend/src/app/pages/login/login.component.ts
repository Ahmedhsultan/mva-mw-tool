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
  pat = '';
  organization = '';
  project = '';
  hidePassword = signal(true);
  loading = signal(false);

  constructor(
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {}

  togglePasswordVisibility(): void {
    this.hidePassword.update(v => !v);
  }

  login(): void {
    if (!this.pat || !this.organization || !this.project) {
      this.snackBar.open('Please fill in all fields', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    this.loading.set(true);
    this.authService.validateToken(this.pat, this.organization, this.project).subscribe({
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
