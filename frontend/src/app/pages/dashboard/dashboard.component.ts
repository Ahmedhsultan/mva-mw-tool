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
import { DevOpsProvider } from '../../core/models';
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
  selectedTabIndex = 0;

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

  setSelectedTab(index: number): void {
    this.selectedTabIndex = index;
  }

  activeProvider(): DevOpsProvider {
    return this.authService.getTabProvider(this.activeTabKey());
  }

  providerLabel(provider: DevOpsProvider): string {
    return provider === 'github' ? 'GitHub' : 'Azure DevOps';
  }

  providerIcon(provider: DevOpsProvider): string {
    return provider === 'github' ? 'code' : 'cloud';
  }

  tabOrganization(tab: 'overview' | 'builds' | 'deployments'): string {
    return this.authService.getProviderSettings(this.authService.getTabProvider(tab)).organization || 'No organization';
  }

  tabProject(tab: 'overview' | 'builds' | 'deployments'): string {
    const provider = this.authService.getTabProvider(tab);
    const fallback = provider === 'github' ? 'No workspace' : 'No project';
    return this.authService.getProviderSettings(provider).project || fallback;
  }

  activeOrganization(): string {
    return this.tabOrganization(this.activeTabKey());
  }

  activeProject(): string {
    return this.tabProject(this.activeTabKey());
  }

  logout(): void {
    this.authService.logout();
  }

  private activeTabKey(): 'overview' | 'builds' | 'deployments' {
    if (this.selectedTabIndex === 1) {
      return 'builds';
    }

    if (this.selectedTabIndex === 2) {
      return 'deployments';
    }

    return 'overview';
  }
}
