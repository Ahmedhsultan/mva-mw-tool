import { Component } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../core/services/auth.service';
import { ConfigDialogComponent } from '../../shared/config-dialog/config-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatCardModule,
    MatDialogModule,
    MatTooltipModule,
    MatMenuModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {

  constructor(
    public authService: AuthService,
    private dialog: MatDialog
  ) {}

  openConfig(): void {
    this.dialog.open(ConfigDialogComponent, {
      width: '960px',
      maxWidth: '96vw',
      maxHeight: '80vh',
      panelClass: 'config-dialog-panel'
    });
  }

  logout(): void {
    this.authService.logout();
  }
}
