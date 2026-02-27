import { Component, inject, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SettingsService,
  PatConfig,
  ServiceConfig,
  ServiceType,
  PipelineType,
  EnvCategory,
} from '../../services/settings.service';
import { AzureDevOpsService } from '../../services/azure-devops.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit {
  @Output() closed = new EventEmitter<void>();

  private settings = inject(SettingsService);
  private azureDevOps = inject(AzureDevOpsService);

  // ── Active tab ─────────────────────────────────────────────
  activeTab: 'services' | 'environments' | 'pat' = 'services';

  // ── Microservices (with full config) ──────────────────────
  serviceConfigs: ServiceConfig[] = [];
  newServiceName = '';
  newServiceType: ServiceType = 'service';
  newBranchPrefix = 'release/primary';
  newPipelineType: PipelineType = 'release';
  newDropDbBranch = '';
  serviceError = '';
  expandedService: string | null = null;

  // ── Environments (per-tab) ──────────────────────────────────
  envCategories: { key: EnvCategory; label: string }[] = [
    { key: 'reservation', label: 'Env Reservation' },
    { key: 'cutoff', label: 'CUT-OFF' },
    { key: 'deploy', label: 'Deploy Build' },
  ];
  envsMap: Record<EnvCategory, string[]> = { reservation: [], cutoff: [], deploy: [] };
  newEnvNames: Record<EnvCategory, string> = { reservation: '', cutoff: '', deploy: '' };
  envErrors: Record<EnvCategory, string> = { reservation: '', cutoff: '', deploy: '' };

  // ── PAT ────────────────────────────────────────────────────
  patValue = '';
  organization = 'vfuk-digital';
  project = 'Digital';
  patSaved = false;
  patValidating = false;
  patValidationResult: { success: boolean; message: string } | null = null;

  ngOnInit(): void {
    this.serviceConfigs = this.settings.serviceConfigs.map((c) => ({ ...c }));
    this.envsMap = {
      reservation: [...this.settings.envsReservation],
      cutoff: [...this.settings.envsCutoff],
      deploy: [...this.settings.envsDeploy],
    };

    const patCfg = this.settings.patConfig;
    if (patCfg) {
      this.patValue = patCfg.pat;
      this.organization = patCfg.organization;
      this.project = patCfg.project;
    }
  }

  // ── Microservice actions ───────────────────────────────────

  addService(): void {
    const name = this.newServiceName.trim().toLowerCase();
    if (!name) return;
    if (this.serviceConfigs.some((c) => c.name === name)) {
      this.serviceError = `"${name}" already exists`;
      return;
    }
    this.serviceError = '';
    const config: ServiceConfig = {
      name,
      type: this.newServiceType,
      branchPrefix: this.newBranchPrefix.trim() || (this.newServiceType === 'library' ? 'primary' : 'release/primary'),
      pipelineType: this.newPipelineType,
      dropDbBranch: this.newDropDbBranch.trim() || undefined,
    };
    this.serviceConfigs.push(config);
    this.settings.addServiceWithConfig(config);
    // Reset form
    this.newServiceName = '';
    this.newServiceType = 'service';
    this.newBranchPrefix = 'release/primary';
    this.newPipelineType = 'release';
    this.newDropDbBranch = '';
  }

  removeService(svc: string): void {
    this.serviceConfigs = this.serviceConfigs.filter((c) => c.name !== svc);
    this.settings.removeMicroservice(svc);
  }

  resetServices(): void {
    this.settings.resetMicroservices();
    this.serviceConfigs = this.settings.serviceConfigs.map((c) => ({ ...c }));
    this.serviceError = '';
    this.expandedService = null;
  }

  toggleExpand(name: string): void {
    this.expandedService = this.expandedService === name ? null : name;
  }

  updateConfig(name: string, field: keyof ServiceConfig, value: any): void {
    const cfg = this.serviceConfigs.find((c) => c.name === name);
    if (!cfg) return;
    (cfg as any)[field] = value;
    // Libraries always use YAML pipeline (no release pipeline)
    if (field === 'type' && value === 'library') {
      cfg.pipelineType = 'yaml';
      this.settings.updateServiceConfig(name, { [field]: value, pipelineType: 'yaml' });
      return;
    }
    this.settings.updateServiceConfig(name, { [field]: value });
  }

  // ── Environment actions (per-tab) ───────────────────────────

  addEnv(cat: EnvCategory): void {
    const name = this.newEnvNames[cat].trim().toLowerCase();
    if (!name) return;
    if (this.envsMap[cat].includes(name)) {
      this.envErrors[cat] = `"${name}" already exists`;
      return;
    }
    this.envErrors[cat] = '';
    this.envsMap[cat].push(name);
    this.newEnvNames[cat] = '';
    this.settings.reorderEnvs(cat, [...this.envsMap[cat]]);
  }

  removeEnv(cat: EnvCategory, env: string): void {
    this.envsMap[cat] = this.envsMap[cat].filter((e) => e !== env);
    this.settings.reorderEnvs(cat, [...this.envsMap[cat]]);
  }

  resetEnvs(cat: EnvCategory): void {
    this.settings.resetEnvs(cat);
    this.envsMap[cat] = [...this.settings.getEnvs(cat)];
    this.envErrors[cat] = '';
  }

  // ── PAT actions ────────────────────────────────────────────

  savePat(): void {
    const config: PatConfig = {
      pat: this.patValue.trim(),
      organization: this.organization.trim(),
      project: this.project.trim(),
    };
    this.settings.savePatConfig(config);
    this.azureDevOps.configure(config);
    this.azureDevOps.persistConfig();
    this.patSaved = true;
    this.patValidationResult = null;
    setTimeout(() => (this.patSaved = false), 2500);
  }

  async validatePat(): Promise<void> {
    if (!this.patValue.trim()) return;
    this.patValidating = true;
    this.patValidationResult = null;

    // Temporarily configure to validate
    this.azureDevOps.configure({
      pat: this.patValue.trim(),
      organization: this.organization.trim(),
      project: this.project.trim(),
    });

    const result = await this.azureDevOps.validatePat();
    this.patValidationResult = result;
    this.patValidating = false;
  }

  clearPat(): void {
    this.patValue = '';
    this.organization = 'vfuk-digital';
    this.project = 'Digital';
    this.settings.clearPatConfig();
    this.patSaved = false;
    this.patValidationResult = null;
  }

  // ── Modal ──────────────────────────────────────────────────

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('settings-backdrop')) {
      this.close();
    }
  }
}
