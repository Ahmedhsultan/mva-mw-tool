import { Component, ViewChild } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../core/services/auth.service';
import { AppTabKey, DevOpsProvider } from '../../core/models';
import { ConfigDialogComponent } from '../../shared/config-dialog/config-dialog.component';
import { PipelinesWorkbenchComponent } from '../pipelines/pipelines-workbench.component';
import { ToolsPageComponent } from '../tools/tools-page.component';
import { VoisResourcesComponent } from '../vois-resources/vois-resources.component';

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
    MatMenuModule,
    PipelinesWorkbenchComponent,
    ToolsPageComponent,
    VoisResourcesComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  @ViewChild(PipelinesWorkbenchComponent) private pipelinesWorkbench?: PipelinesWorkbenchComponent;
  selectedTabIndex = 0;

  constructor(
    public authService: AuthService,
    private dialog: MatDialog
  ) {
    this.refreshAvatarIfMissing();
    this.openConfigIfFirstLogin();
  }

  private openConfigIfFirstLogin(): void {
    if (!sessionStorage.getItem('mva_configDone')) {
      sessionStorage.setItem('mva_configDone', '1');
      // Delay slightly so the dashboard renders first
      setTimeout(() => this.openConfig(), 300);
    }
  }

  private refreshAvatarIfMissing(): void {
    if (this.authService.isAuthenticated() && !this.authService.avatarUrl()) {
      const provider = this.authService.provider();
      const settings = this.authService.getProviderSettings(provider);
      if (settings.pat) {
        this.authService.validateToken(provider, settings.pat, settings.organization, settings.project)
          .subscribe();
      }
    }
  }

  openConfig(): void {
    const dialogRef = this.dialog.open(ConfigDialogComponent, {
      width: '960px',
      maxWidth: '96vw',
      maxHeight: '80vh',
      panelClass: 'config-dialog-panel'
    });

    dialogRef.afterClosed().subscribe(() => {
      this.pipelinesWorkbench?.refreshWorkspace();
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

  tabOrganization(tab: AppTabKey): string {
    return this.authService.getProviderSettings(this.authService.getTabProvider(tab)).organization || 'No organization';
  }

  tabProject(tab: AppTabKey): string {
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

  private activeTabKey(): AppTabKey {
    return 'config';
  }
}
