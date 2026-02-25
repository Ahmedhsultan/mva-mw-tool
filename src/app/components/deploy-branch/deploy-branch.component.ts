import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MICROSERVICES } from '../../models/release-pipeline.model';
import { ENVIRONMENTS } from '../../models/reservation.model';
import { AzureDevOpsService } from '../../services/azure-devops.service';
import { ReservationService } from '../../services/reservation.service';
import type { Reservation } from '../../models/reservation.model';

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'warning';

export interface ServiceTask {
  service: string;
  status: TaskStatus;
  message: string;
  buildId?: number;
  buildUrl?: string;
}

export interface EnvTask {
  env: string;
  status: TaskStatus;
  message: string;
  /** service → release result */
  deployments: DeployTask[];
}

export interface DeployTask {
  service: string;
  env: string;
  status: TaskStatus;
  message: string;
  releaseId?: number;
  releaseUrl?: string;
}

export interface DeployStep {
  id: string;
  label: string;
  description: string;
  status: TaskStatus;
}

export interface DeployHistoryEntry {
  id: string;
  branch: string;
  services: string[];
  environments: string[];
  startedAt: string;
  finishedAt: string;
  overallStatus: 'success' | 'failed' | 'interrupted';
  logs: string[];
  steps: DeployStep[];
  patResult: ServiceTask | null;
  branchTasks: ServiceTask[];
  buildTasks: ServiceTask[];
  deployTasks: DeployTask[];
  envReservationTasks: EnvTask[];
}

@Component({
  selector: 'app-deploy-branch',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deploy-branch.component.html',
  styleUrl: './deploy-branch.component.css',
})
export class DeployBranchComponent implements OnInit, OnDestroy {
  private azureDevOps = inject(AzureDevOpsService);
  private reservationService = inject(ReservationService);

  readonly allServices = MICROSERVICES as readonly string[];
  readonly allEnvironments = [...ENVIRONMENTS] as string[];

  // ── Config ─────────────────────────────────────────────────
  pat = '';
  organization = 'vfuk-digital';
  project = 'Digital';
  isConfigured = false;

  // ── Form ───────────────────────────────────────────────────
  selectedServices: Set<string> = new Set();
  branchName = '';
  selectedEnvironments: Set<string> = new Set();

  // ── Run State ─────────────────────────────────────────────
  isRunning = false;
  isComplete = false;
  logs: string[] = [];

  // ── Run ID & History ─────────────────────────────────────
  runId = '';
  runStartedAt = '';
  history: DeployHistoryEntry[] = [];
  showHistory = false;
  expandedHistoryId: string | null = null;

  // ── History Full-View Modal ────────────────────────────────
  showHistoryModal = false;
  historyModalRun: DeployHistoryEntry | null = null;
  modalRefreshingBuild: Set<string> = new Set();
  modalRefreshingDeploy: Set<string> = new Set();
  modalRefreshingAll = false;

  // ── Active-Run Per-Task Refresh ────────────────────────────
  refreshingActiveBuild: Set<string> = new Set();
  refreshingActiveDeploy: Set<string> = new Set();
  refreshingActiveBuildAll = false;
  refreshingActiveDeployAll = false;
  // ── Interrupt / Resume ───────────────────────────────────────────────────────────
  wasInterrupted = false;
  // Steps
  steps: DeployStep[] = [];
  patResult: ServiceTask | null = null;
  branchTasks: ServiceTask[] = [];
  envReservationTasks: EnvTask[] = [];
  buildTasks: ServiceTask[] = [];
  deployTasks: DeployTask[] = [];

  // Reservation approval gate
  waitingForApproval = false;
  reservedEnvs: { env: string; reservedBy: string[]; reservations: Reservation[] }[] = [];
  private approvalResolver: ((approved: boolean) => void) | null = null;
  approvalDecision: boolean | null = null;

  // Firestore reservations
  private allReservations: Reservation[] = [];
  private reservationSub?: Subscription;

  ngOnInit(): void {
    const saved = this.azureDevOps.restoreConfig();
    if (saved) {
      const raw = localStorage.getItem('azure-devops-config');
      if (raw) {
        try {
          const cfg = JSON.parse(raw);
          this.pat = cfg.pat ?? '';
          this.organization = cfg.organization ?? 'vfuk-digital';
          this.project = cfg.project ?? 'Digital';
          this.isConfigured = true;
        } catch {}
      }
    }

    this.reservationSub = this.reservationService.getReservations$().subscribe((r) => {
      this.allReservations = r;
    });
    this.loadHistory();
    this.restoreRunState();
  }

  ngOnDestroy(): void {
    this.reservationSub?.unsubscribe();
  }

  // ── Config ─────────────────────────────────────────────────
  configure(): void {
    if (!this.pat.trim()) return;
    this.azureDevOps.configure({
      pat: this.pat.trim(),
      organization: this.organization,
      project: this.project,
    });
    this.azureDevOps.persistConfig();
    this.isConfigured = true;
  }

  changePat(): void {
    this.isConfigured = false;
    this.pat = '';
  }

  // ── Form helpers ───────────────────────────────────────────
  toggleService(svc: string): void {
    if (this.selectedServices.has(svc)) this.selectedServices.delete(svc);
    else this.selectedServices.add(svc);
  }

  toggleEnv(env: string): void {
    if (this.selectedEnvironments.has(env)) this.selectedEnvironments.delete(env);
    else this.selectedEnvironments.add(env);
  }

  selectAllServices(): void {
    this.allServices.forEach((s) => this.selectedServices.add(s));
  }
  clearAllServices(): void { this.selectedServices.clear(); }

  canRun(): boolean {
    return (
      this.isConfigured &&
      this.selectedServices.size > 0 &&
      this.branchName.trim().length > 0 &&
      this.selectedEnvironments.size > 0 &&
      !this.isRunning
    );
  }

  canResumeBuild(): boolean {
    const step = this.steps.find((s) => s.id === 'build');
    return this.wasInterrupted && !!step && (step.status === 'failed' || step.status === 'running') && this.buildTasks.length > 0;
  }

  canResumeDeploy(): boolean {
    const step = this.steps.find((s) => s.id === 'deploy');
    return this.wasInterrupted && !!step && (step.status === 'failed' || step.status === 'running') && this.deployTasks.some((t) => t.releaseId != null);
  }

  // ── Approval gate ──────────────────────────────────────────
  approve(): void {
    this.approvalDecision = true;
    this.approvalResolver?.(true);
    this.approvalResolver = null;
  }
  reject(): void {
    this.approvalDecision = false;
    this.approvalResolver?.(false);
    this.approvalResolver = null;
  }

  private waitForApproval(): Promise<boolean> {
    this.waitingForApproval = true;
    this.approvalDecision = null;
    return new Promise<boolean>((resolve) => {
      this.approvalResolver = resolve;
    }).then((v) => {
      this.waitingForApproval = false;
      return v;
    });
  }

  // ── Logging ────────────────────────────────────────────────
  private log(msg: string): void {
    const ts = new Date().toLocaleTimeString();
    this.logs.push(`[${ts}] ${msg}`);
    this.saveCurrentRun();
  }

  // ── Pipeline ───────────────────────────────────────────────
  async run(): Promise<void> {
    if (!this.canRun()) return;

    this.isRunning = true;
    this.isComplete = false;
    this.logs = [];
    this.patResult = null;
    this.branchTasks = [];
    this.envReservationTasks = [];
    this.buildTasks = [];
    this.deployTasks = [];
    this.reservedEnvs = [];
    this.approvalDecision = null;
    this.waitingForApproval = false;
    this.runId = Date.now().toString();
    this.runStartedAt = new Date().toISOString();

    const services = Array.from(this.selectedServices);
    const envs = Array.from(this.selectedEnvironments);
    const branch = this.branchName.trim();

    this.steps = [
      { id: 'validate-pat',   label: 'Validate PAT',            description: 'Verify Azure DevOps access', status: 'pending' },
      { id: 'check-branch',   label: 'Check Branch',            description: `Verify "${branch}" exists in selected repos`, status: 'pending' },
      { id: 'check-env',      label: 'Check Environment',       description: 'Check if target environments are reserved', status: 'pending' },
      { id: 'build',          label: 'Build',                   description: 'Queue and wait for builds on the branch', status: 'pending' },
      { id: 'deploy',         label: 'Deploy',                  description: `Deploy to ${envs.join(', ')}`, status: 'pending' },
    ];
    this.saveCurrentRun();

    try {
      // ── Step 0: Validate PAT ────────────────────────────────
      this.setStep('validate-pat', 'running');
      this.patResult = { service: 'Azure DevOps', status: 'running', message: 'Validating PAT...' };
      this.log('Validating Azure DevOps PAT...');
      const patRes = await this.azureDevOps.validatePat();
      this.patResult = { service: 'Azure DevOps', status: patRes.success ? 'success' : 'failed', message: patRes.message };
      this.log(patRes.message);
      if (!patRes.success) {
        this.setStep('validate-pat', 'failed');
        this.finish(false);
        return;
      }
      this.setStep('validate-pat', 'success');

      // ── Step 1: Check branch exists ─────────────────────────
      this.setStep('check-branch', 'running');
      this.branchTasks = services.map((s) => ({ service: s, status: 'pending' as TaskStatus, message: '' }));
      await Promise.all(
        services.map(async (svc) => {
          const task = this.branchTasks.find((t) => t.service === svc)!;
          task.status = 'running';
          this.log(`[${svc}] Checking branch "${branch}"...`);
          const res = await this.azureDevOps.checkBranchExists(svc, '', branch);
          task.status = res.exists ? 'success' : 'failed';
          task.message = res.message;
          this.log(`[${svc}] ${res.message}`);
        })
      );
      const branchFailed = this.branchTasks.some((t) => t.status === 'failed');
      this.setStep('check-branch', branchFailed ? 'failed' : 'success');
      if (branchFailed) {
        this.finish(false);
        return;
      }

      // ── Step 2: Check environment reservations ──────────────
      this.setStep('check-env', 'running');
      this.envReservationTasks = envs.map((env) => ({
        env,
        status: 'pending' as TaskStatus,
        message: '',
        deployments: [],
      }));

      const today = new Date().toISOString().split('T')[0];
      this.reservedEnvs = [];

      for (const task of this.envReservationTasks) {
        task.status = 'running';
        const activeReservations = this.allReservations.filter(
          (r) =>
            r.environment.toLowerCase() === task.env.toLowerCase() &&
            r.startDate <= today &&
            r.endDate >= today
        );
        if (activeReservations.length > 0) {
          task.status = 'warning';
          const names = activeReservations.map((r) => r.userName).join(', ');
          task.message = `Reserved by: ${names}`;
          this.reservedEnvs.push({ env: task.env, reservedBy: activeReservations.map((r) => r.userName), reservations: activeReservations });
          this.log(`[${task.env}] ⚠ Currently reserved by ${names}`);
        } else {
          task.status = 'success';
          task.message = 'Available';
          this.log(`[${task.env}] ✓ Available`);
        }
      }

      if (this.reservedEnvs.length > 0) {
        this.setStep('check-env', 'warning');
        this.log('⏸ Some environments are reserved — waiting for user approval...');
        const approved = await this.waitForApproval();
        if (!approved) {
          this.log('✗ User declined to continue with reserved environments.');
          this.envReservationTasks.forEach((t) => {
            if (t.status === 'warning') { t.status = 'failed'; t.message += ' — rejected by user'; }
          });
          this.setStep('check-env', 'failed');
          this.finish(false);
          return;
        }
        this.log('✓ User approved — continuing despite reserved environments.');
        this.envReservationTasks.forEach((t) => {
          if (t.status === 'warning') t.message += ' — overridden by user';
        });
      }
      this.setStep('check-env', 'success');

      // ── Step 3: Build ────────────────────────────────────────
      this.setStep('build', 'running');
      this.buildTasks = services.map((s) => ({ service: s, status: 'pending' as TaskStatus, message: '', buildId: undefined, buildUrl: undefined }));
      await Promise.all(
        services.map(async (svc) => {
          const task = this.buildTasks.find((t) => t.service === svc)!;
          task.status = 'running';
          task.message = `Queuing build for "${branch}"...`;
          this.log(`[${svc}] Queuing build on branch "${branch}"...`);
          const queueRes = await this.azureDevOps.queueBuild(svc, branch);
          if (!queueRes.success) {
            task.status = 'failed';
            task.message = queueRes.message;
            this.log(`[${svc}] ✗ ${queueRes.message}`);
            return;
          }
          task.buildId = queueRes.buildId;
          task.buildUrl = queueRes.buildUrl;
          task.message = queueRes.message;
          this.log(`[${svc}] Build #${queueRes.buildId} queued — waiting...`);
          const waitRes = await this.azureDevOps.waitForBuild(queueRes.buildId!, (s) => { task.message = s; });
          task.status = waitRes.success ? 'success' : 'failed';
          task.message = waitRes.message;
          this.log(`[${svc}] ${waitRes.message}`);
        })
      );
      const buildFailed = this.buildTasks.some((t) => t.status === 'failed');
      this.setStep('build', buildFailed ? 'failed' : 'success');
      if (buildFailed) {
        this.log('Pipeline stopped: one or more builds failed.');
        this.finish(false);
        return;
      }

      // ── Step 4: Deploy to all environments ────────────────────
      this.deployTasks = [];
      await this._doDeployStep(services, envs);
    } catch (err: any) {
      this.log(`Unexpected error: ${err.message || String(err)}`);
      this.finish(false);
    }
  }

  // ── Shared deploy step (used by run, resume, rerun) ────────
  private async _doDeployStep(services: string[], envs: string[]): Promise<void> {
    this.setStep('deploy', 'running');
    await Promise.all(
      services.map(async (svc) => {
        const build = this.buildTasks.find((t) => t.service === svc);
        if (!build?.buildId) return;
        await Promise.all(
          envs.map(async (env) => {
            let task = this.deployTasks.find((t) => t.service === svc && t.env === env);
            if (!task) {
              task = { service: svc, env, status: 'running', message: `Creating release for ${env}...` };
              this.deployTasks.push(task);
            } else {
              task.status = 'running';
              task.message = `Creating release for ${env}...`;
            }
            this.log(`[${svc}→${env}] Deploying build #${build.buildId}...`);
            const res = await this.azureDevOps.deploy(build.buildId!, env, svc);
            if (!res.success) {
              task.status = 'failed'; task.message = res.message;
              this.log(`[${svc}→${env}] ✗ ${res.message}`); return;
            }
            task.releaseId = res.releaseId;
            task.releaseUrl = res.releaseUrl;
            task.message = res.message;
            this.log(`[${svc}→${env}] ${res.message}`);
            if (res.releaseId) {
              const waitRes = await this.azureDevOps.waitForDeployment(
                res.releaseId, res.releaseEnvironment || env, (s) => { task!.message = s; }
              );
              task.status = waitRes.success ? 'success' : 'failed';
              task.message = waitRes.message;
              this.log(`[${svc}→${env}] ${waitRes.message}`);
            } else { task.status = 'success'; }
          })
        );
      })
    );
    const deployFailed = this.deployTasks.some((t) => t.status === 'failed');
    this.setStep('deploy', deployFailed ? 'failed' : 'success');
    this.finish(!deployFailed);
  }

  // ── Resume after interrupt ─────────────────────────────────
  async resumeFromBuild(): Promise<void> {
    if (!this.canResumeBuild() || this.isRunning) return;
    this.wasInterrupted = false;
    this.isRunning = true;
    this.isComplete = false;
    this.runId = Date.now().toString();
    this.runStartedAt = new Date().toISOString();
    const services = Array.from(this.selectedServices);
    const envs = Array.from(this.selectedEnvironments);
    this.setStep('build', 'running');
    this.setStep('deploy', 'pending');
    this.deployTasks = [];
    this.saveCurrentRun();
    this.log('↻ Resuming from Build — re-polling existing builds...');
    try {
      await Promise.all(services.map(async (svc) => {
        let task = this.buildTasks.find((t) => t.service === svc);
        if (!task) { task = { service: svc, status: 'pending', message: '' }; this.buildTasks.push(task); }
        if (task.status === 'success') { this.log(`[${svc}] ✓ Already succeeded, skipping.`); return; }
        task.status = 'running';
        if (task.buildId) {
          this.log(`[${svc}] Re-polling build #${task.buildId}...`);
          const w = await this.azureDevOps.waitForBuild(task.buildId, (m) => { task!.message = m; });
          task.status = w.success ? 'success' : 'failed';
          task.message = w.message;
          this.log(`[${svc}] ${w.message}`);
        } else {
          const branch = this.branchName;
          task.message = `Queuing build for "${branch}"...`;
          this.log(`[${svc}] Queuing build on branch "${branch}"...`);
          const q = await this.azureDevOps.queueBuild(svc, branch);
          if (!q.success) { task.status = 'failed'; task.message = q.message; this.log(`[${svc}] ✗ ${q.message}`); return; }
          task.buildId = q.buildId; task.buildUrl = q.buildUrl; task.message = q.message;
          this.log(`[${svc}] Build #${q.buildId} queued — waiting...`);
          const w = await this.azureDevOps.waitForBuild(q.buildId!, (m) => { task!.message = m; });
          task.status = w.success ? 'success' : 'failed';
          task.message = w.message;
          this.log(`[${svc}] ${w.message}`);
        }
      }));
      const buildFailed = this.buildTasks.some((t) => t.status === 'failed');
      this.setStep('build', buildFailed ? 'failed' : 'success');
      if (buildFailed) { this.log('Pipeline stopped: builds failed.'); this.finish(false); return; }
      await this._doDeployStep(services, envs);
    } catch (err: any) {
      this.log(`Unexpected error: ${err.message || String(err)}`); this.finish(false);
    }
  }

  async resumeFromDeploy(): Promise<void> {
    if (!this.canResumeDeploy() || this.isRunning) return;
    this.wasInterrupted = false;
    this.isRunning = true;
    this.isComplete = false;
    this.runId = Date.now().toString();
    this.runStartedAt = new Date().toISOString();
    this.setStep('deploy', 'running');
    this.saveCurrentRun();
    this.log('↻ Resuming from Deploy — re-polling existing releases...');
    try {
      await Promise.all(
        this.deployTasks.filter((t) => t.status !== 'success').map(async (task) => {
          task.status = 'running';
          if (task.releaseId) {
            this.log(`[${task.service}→${task.env}] Re-polling release #${task.releaseId}...`);
            const w = await this.azureDevOps.waitForDeployment(task.releaseId, task.env, (m) => { task.message = m; });
            task.status = w.success ? 'success' : 'failed';
            task.message = w.message;
            this.log(`[${task.service}→${task.env}] ${w.message}`);
          } else {
            const build = this.buildTasks.find((t) => t.service === task.service);
            if (!build?.buildId) { task.status = 'failed'; task.message = 'No build ID — rerun build first'; return; }
            this.log(`[${task.service}→${task.env}] Creating release...`);
            const res = await this.azureDevOps.deploy(build.buildId, task.env, task.service);
            if (!res.success) { task.status = 'failed'; task.message = res.message; return; }
            task.releaseId = res.releaseId; task.releaseUrl = res.releaseUrl; task.message = res.message;
            if (res.releaseId) {
              const w = await this.azureDevOps.waitForDeployment(res.releaseId, res.releaseEnvironment || task.env, (m) => { task.message = m; });
              task.status = w.success ? 'success' : 'failed';
              task.message = w.message;
              this.log(`[${task.service}→${task.env}] ${w.message}`);
            } else { task.status = 'success'; }
          }
        })
      );
      const deployFailed = this.deployTasks.some((t) => t.status === 'failed');
      this.setStep('deploy', deployFailed ? 'failed' : 'success');
      this.finish(!deployFailed);
    } catch (err: any) {
      this.log(`Unexpected error: ${err.message || String(err)}`); this.finish(false);
    }
  }

  // ── Rerun from step ────────────────────────────────────────
  async rerunBuildStep(): Promise<void> {
    if (this.isRunning) return;
    this.wasInterrupted = false;
    this.isRunning = true;
    this.isComplete = false;
    this.runId = Date.now().toString();
    this.runStartedAt = new Date().toISOString();
    const services = Array.from(this.selectedServices);
    const envs = Array.from(this.selectedEnvironments);
    const branch = this.branchName;
    this.buildTasks = services.map((s) => ({ service: s, status: 'pending' as TaskStatus, message: '' }));
    this.deployTasks = [];
    this.setStep('build', 'running');
    this.setStep('deploy', 'pending');
    this.saveCurrentRun();
    this.log('↻ Rerunning Build step...');
    try {
      await Promise.all(services.map(async (svc) => {
        const task = this.buildTasks.find((t) => t.service === svc)!;
        task.status = 'running'; task.message = `Queuing build for "${branch}"...`;
        this.log(`[${svc}] Queuing build on branch "${branch}"...`);
        const q = await this.azureDevOps.queueBuild(svc, branch);
        if (!q.success) { task.status = 'failed'; task.message = q.message; this.log(`[${svc}] ✗ ${q.message}`); return; }
        task.buildId = q.buildId; task.buildUrl = q.buildUrl; task.message = q.message;
        this.log(`[${svc}] Build #${q.buildId} queued — waiting...`);
        const w = await this.azureDevOps.waitForBuild(q.buildId!, (m) => { task.message = m; });
        task.status = w.success ? 'success' : 'failed';
        task.message = w.message;
        this.log(`[${svc}] ${w.message}`);
      }));
      const buildFailed = this.buildTasks.some((t) => t.status === 'failed');
      this.setStep('build', buildFailed ? 'failed' : 'success');
      if (buildFailed) { this.log('Pipeline stopped: builds failed.'); this.finish(false); return; }
      await this._doDeployStep(services, envs);
    } catch (err: any) {
      this.log(`Unexpected error: ${err.message || String(err)}`); this.finish(false);
    }
  }

  async rerunDeployStep(): Promise<void> {
    if (this.isRunning) return;
    const hasBuildIds = this.buildTasks.some((t) => t.buildId);
    if (!hasBuildIds) { this.log('No successful builds to deploy — rerun Build step first.'); return; }
    this.wasInterrupted = false;
    this.isRunning = true;
    this.isComplete = false;
    this.runId = Date.now().toString();
    this.runStartedAt = new Date().toISOString();
    const services = this.buildTasks.filter((t) => t.buildId).map((t) => t.service);
    const envs = Array.from(this.selectedEnvironments);
    this.deployTasks = [];
    this.setStep('deploy', 'pending');
    this.saveCurrentRun();
    this.log('↻ Rerunning Deploy step...');
    try {
      await this._doDeployStep(services, envs);
    } catch (err: any) {
      this.log(`Unexpected error: ${err.message || String(err)}`); this.finish(false);
    }
  }

  private setStep(id: string, status: TaskStatus): void {
    const step = this.steps.find((s) => s.id === id);
    if (step) step.status = status;
    this.saveCurrentRun();
  }

  private finish(success: boolean): void {
    this.isRunning = false;
    this.isComplete = true;
    this.log(success ? '✓ Deploy complete.' : '✗ Deploy finished with errors.');
    const entry: DeployHistoryEntry = {
      id: this.runId,
      branch: this.branchName,
      services: Array.from(this.selectedServices),
      environments: Array.from(this.selectedEnvironments),
      startedAt: this.runStartedAt,
      finishedAt: new Date().toISOString(),
      overallStatus: success ? 'success' : 'failed',
      logs: [...this.logs],
      steps: [...this.steps],
      patResult: this.patResult,
      branchTasks: [...this.branchTasks],
      buildTasks: [...this.buildTasks],
      deployTasks: [...this.deployTasks],
      envReservationTasks: [...this.envReservationTasks],
    };
    this.history.unshift(entry);
    if (this.history.length > 20) this.history.length = 20;
    this.saveHistory();
  }

  // ── Grouping helpers for template ─────────────────────────
  deployEnvs(): string[] {
    return [...new Set(this.deployTasks.map((t) => t.env))];
  }

  deployByEnv(env: string): DeployTask[] {
    return this.deployTasks.filter((t) => t.env === env);
  }

  reset(): void {
    this.isRunning = false;
    this.isComplete = false;
    this.logs = [];
    this.steps = [];
    this.patResult = null;
    this.branchTasks = [];
    this.envReservationTasks = [];
    this.buildTasks = [];
    this.deployTasks = [];
    this.reservedEnvs = [];
    this.waitingForApproval = false;
    this.approvalDecision = null;
    this.runId = '';
    this.runStartedAt = '';
    this.wasInterrupted = false;
    localStorage.removeItem('db-run-state');
  }

  // ── History & Persistence ──────────────────────────────────
  private saveCurrentRun(): void {
    if (!this.runId) return;
    localStorage.setItem('db-run-state', JSON.stringify({
      runId: this.runId,
      branch: this.branchName,
      services: Array.from(this.selectedServices),
      environments: Array.from(this.selectedEnvironments),
      startedAt: this.runStartedAt,
      isRunning: this.isRunning,
      isComplete: this.isComplete,
      logs: this.logs,
      steps: this.steps,
      patResult: this.patResult,
      branchTasks: this.branchTasks,
      buildTasks: this.buildTasks,
      deployTasks: this.deployTasks,
      envReservationTasks: this.envReservationTasks,
    }));
  }

  private restoreRunState(): void {
    const raw = localStorage.getItem('db-run-state');
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      // Restore common fields first
      this.runId = s.runId || '';
      this.runStartedAt = s.startedAt || '';
      this.branchName = s.branch || '';
      this.selectedServices = new Set<string>(s.services || []);
      this.selectedEnvironments = new Set<string>(s.environments || []);
      this.patResult = s.patResult ?? null;

      if (s.isRunning) {
        const ts = new Date().toLocaleTimeString();
        this.logs = [...(s.logs || []), `[${ts}] ✗ Run interrupted by page refresh.`];
        this.steps = (s.steps || []).map((st: DeployStep) =>
          st.status === 'running' ? { ...st, status: 'failed' as TaskStatus } : st
        );
        this.branchTasks = (s.branchTasks || []).map((t: ServiceTask) =>
          t.status === 'running' ? { ...t, status: 'failed' as TaskStatus, message: 'Interrupted by refresh' } : t
        );
        this.buildTasks = (s.buildTasks || []).map((t: ServiceTask) =>
          t.status === 'running' ? { ...t, status: 'failed' as TaskStatus, message: 'Interrupted — resume to re-poll' } : t
        );
        this.deployTasks = (s.deployTasks || []).map((t: DeployTask) =>
          t.status === 'running' ? { ...t, status: 'failed' as TaskStatus, message: 'Interrupted — resume to re-poll' } : t
        );
        this.envReservationTasks = (s.envReservationTasks || []).map((t: EnvTask) =>
          t.status === 'running' ? { ...t, status: 'failed' as TaskStatus, message: 'Interrupted by refresh' } : t
        );
        this.wasInterrupted = true;
        this.isComplete = true;
        this.isRunning = false;
        // Also save interrupted run to history
        const entry: DeployHistoryEntry = {
          id: this.runId || Date.now().toString(),
          branch: this.branchName,
          services: Array.from(this.selectedServices),
          environments: Array.from(this.selectedEnvironments),
          startedAt: this.runStartedAt,
          finishedAt: new Date().toISOString(),
          overallStatus: 'interrupted',
          logs: [...this.logs],
          steps: [...this.steps],
          patResult: this.patResult,
          branchTasks: [...this.branchTasks],
          buildTasks: [...this.buildTasks],
          deployTasks: [...this.deployTasks],
          envReservationTasks: [...this.envReservationTasks],
        };
        this.history.unshift(entry);
        if (this.history.length > 20) this.history.length = 20;
        this.saveHistory();
        localStorage.removeItem('db-run-state');
      } else if (s.isComplete) {
        this.logs = s.logs || [];
        this.steps = s.steps || [];
        this.branchTasks = s.branchTasks || [];
        this.buildTasks = s.buildTasks || [];
        this.deployTasks = s.deployTasks || [];
        this.envReservationTasks = s.envReservationTasks || [];
        this.isComplete = true;
        this.isRunning = false;
      }
    } catch { localStorage.removeItem('db-run-state'); }
  }

  private loadHistory(): void {
    try {
      const raw = localStorage.getItem('db-run-history');
      if (raw) this.history = JSON.parse(raw);
    } catch { this.history = []; }
  }

  private saveHistory(): void {
    localStorage.setItem('db-run-history', JSON.stringify(this.history));
  }

  toggleHistory(): void { this.showHistory = !this.showHistory; }

  toggleHistoryLogs(id: string): void {
    this.expandedHistoryId = this.expandedHistoryId === id ? null : id;
  }

  clearHistory(): void {
    this.history = [];
    localStorage.removeItem('db-run-history');
  }

  get hasActiveBuildIds(): boolean {
    return this.buildTasks.some((t) => !!t.buildId);
  }

  // ── Active-Run Per-Task Refresh ────────────────────────────
  async refreshActiveBuildTask(task: ServiceTask): Promise<void> {
    if (!task.buildId || this.refreshingActiveBuild.has(task.service)) return;
    this.refreshingActiveBuild = new Set(this.refreshingActiveBuild).add(task.service);
    try {
      const result = await this.azureDevOps.checkBuildStatus(task.buildId);
      if (result.done) {
        task.status = result.success ? 'success' : 'failed';
        task.message = result.success
          ? `Build #${task.buildId} succeeded`
          : `Build #${task.buildId} ${result.result || 'failed'}`;
        this.syncBuildStepStatus();
        this.saveCurrentRun();
      } else {
        // Still running on Azure — resume polling to completion
        task.status = 'running';
        task.message = `Build #${task.buildId}: ${result.status}...`;
        this.syncBuildStepStatus();
        this.isComplete = false;
        this.wasInterrupted = false;
        this.saveCurrentRun();
        const w = await this.azureDevOps.waitForBuild(task.buildId!, (m) => { task.message = m; });
        task.status = w.success ? 'success' : 'failed';
        task.message = w.message;
        this.syncBuildStepStatus();
        // If all builds done now, continue to deploy if not already deployed
        const anyFailed = this.buildTasks.some((t) => t.status === 'failed');
        const allDone = this.buildTasks.every((t) => t.status === 'success' || t.status === 'failed');
        if (allDone) {
          this.isComplete = true;
          this.syncBuildStepStatus();
          this.saveCurrentRun();
        }
      }
    } finally {
      const next = new Set(this.refreshingActiveBuild);
      next.delete(task.service);
      this.refreshingActiveBuild = next;
    }
  }

  private syncBuildStepStatus(): void {
    const buildStep = this.steps.find((s) => s.id === 'build');
    if (!buildStep) return;
    if (this.buildTasks.some((t) => t.status === 'running')) {
      buildStep.status = 'running';
    } else if (this.buildTasks.some((t) => t.status === 'failed')) {
      buildStep.status = 'failed';
    } else if (this.buildTasks.every((t) => t.status === 'success')) {
      buildStep.status = 'success';
    }
  }

  async refreshAllActiveBuild(): Promise<void> {
    if (this.refreshingActiveBuildAll) return;
    this.refreshingActiveBuildAll = true;
    try {
      await Promise.all(this.buildTasks.filter((t) => t.buildId).map((t) => this.refreshActiveBuildTask(t)));
    } finally {
      this.refreshingActiveBuildAll = false;
    }
  }

  async refreshActiveDeployTask(task: DeployTask): Promise<void> {
    const key = `${task.service}-${task.env}`;
    if (!task.releaseId || this.refreshingActiveDeploy.has(key)) return;
    this.refreshingActiveDeploy = new Set(this.refreshingActiveDeploy).add(key);
    try {
      const result = await this.azureDevOps.checkDeploymentStatus(task.releaseId, task.env);
      if (result.done) {
        task.status = result.success ? 'success' : 'failed';
        task.message = `Release #${task.releaseId} deployment ${result.statusName}`;
        this.syncDeployStepStatus();
        this.saveCurrentRun();
      } else {
        // Still running on Azure — resume polling to completion
        task.status = 'running';
        task.message = `Release #${task.releaseId} deployment ${result.statusName}...`;
        this.syncDeployStepStatus();
        this.isComplete = false;
        this.wasInterrupted = false;
        this.saveCurrentRun();
        const w = await this.azureDevOps.waitForDeployment(task.releaseId!, task.env, (m) => { task.message = m; });
        task.status = w.success ? 'success' : 'failed';
        task.message = w.message;
        const allDone = this.deployTasks.every((t) => t.status === 'success' || t.status === 'failed');
        if (allDone) {
          this.isComplete = true;
          this.syncDeployStepStatus();
          this.saveCurrentRun();
        }
      }
    } finally {
      const next = new Set(this.refreshingActiveDeploy);
      next.delete(key);
      this.refreshingActiveDeploy = next;
    }
  }

  private syncDeployStepStatus(): void {
    const deployStep = this.steps.find((s) => s.id === 'deploy');
    if (!deployStep) return;
    if (this.deployTasks.some((t) => t.status === 'running')) {
      deployStep.status = 'running';
    } else if (this.deployTasks.some((t) => t.status === 'failed')) {
      deployStep.status = 'failed';
    } else if (this.deployTasks.every((t) => t.status === 'success')) {
      deployStep.status = 'success';
    }
  }

  async refreshAllActiveDeploy(): Promise<void> {
    if (this.refreshingActiveDeployAll) return;
    this.refreshingActiveDeployAll = true;
    try {
      await Promise.all(this.deployTasks.filter((t) => t.releaseId).map((t) => this.refreshActiveDeployTask(t)));
    } finally {
      this.refreshingActiveDeployAll = false;
    }
  }

  // ── History Modal ─────────────────────────────────────────
  openHistoryModal(run?: DeployHistoryEntry): void {
    this.showHistoryModal = true;
    this.historyModalRun = run ?? this.history[0] ?? null;
  }

  openHistoryModalRun(run: DeployHistoryEntry): void {
    this.openHistoryModal(run);
  }

  closeHistoryModal(): void {
    this.showHistoryModal = false;
  }

  selectHistoryModalRun(run: DeployHistoryEntry): void {
    this.historyModalRun = run;
  }

  async refreshModalBuildTask(run: DeployHistoryEntry, task: ServiceTask): Promise<void> {
    if (!task.buildId || this.modalRefreshingBuild.has(task.service)) return;
    this.modalRefreshingBuild = new Set(this.modalRefreshingBuild).add(task.service);
    try {
      const result = await this.azureDevOps.checkBuildStatus(task.buildId);
      if (result.done) {
        task.status = result.success ? 'success' : 'failed';
        task.message = result.success
          ? `Build #${task.buildId} succeeded`
          : `Build #${task.buildId} ${result.result || 'failed'}`;
      } else {
        task.status = 'running';
        task.message = `Build #${task.buildId}: ${result.status}...`;
      }
      this.syncHistoryBuildStep(run);
      this.saveHistory();
    } finally {
      const next = new Set(this.modalRefreshingBuild);
      next.delete(task.service);
      this.modalRefreshingBuild = next;
    }
  }

  async refreshModalDeployTask(run: DeployHistoryEntry, task: DeployTask): Promise<void> {
    const key = `${task.service}-${task.env}`;
    if (!task.releaseId || this.modalRefreshingDeploy.has(key)) return;
    this.modalRefreshingDeploy = new Set(this.modalRefreshingDeploy).add(key);
    try {
      const result = await this.azureDevOps.checkDeploymentStatus(task.releaseId, task.env);
      task.status = result.done ? (result.success ? 'success' : 'failed') : 'running';
      task.message = `Release #${task.releaseId} deployment ${result.statusName}`;
      this.syncHistoryDeployStep(run);
      this.saveHistory();
    } finally {
      const next = new Set(this.modalRefreshingDeploy);
      next.delete(key);
      this.modalRefreshingDeploy = next;
    }
  }

  private syncHistoryBuildStep(run: DeployHistoryEntry): void {
    const step = run.steps.find((s) => s.id === 'build');
    if (!step) return;
    if (run.buildTasks.some((t) => t.status === 'running')) step.status = 'running';
    else if (run.buildTasks.some((t) => t.status === 'failed')) step.status = 'failed';
    else if (run.buildTasks.every((t) => t.status === 'success')) step.status = 'success';
  }

  private syncHistoryDeployStep(run: DeployHistoryEntry): void {
    const step = run.steps.find((s) => s.id === 'deploy');
    if (!step) return;
    if (run.deployTasks.some((t) => t.status === 'running')) step.status = 'running';
    else if (run.deployTasks.some((t) => t.status === 'failed')) step.status = 'failed';
    else if (run.deployTasks.every((t) => t.status === 'success')) step.status = 'success';
  }

  async refreshAllModalSteps(run: DeployHistoryEntry): Promise<void> {
    if (this.modalRefreshingAll) return;
    this.modalRefreshingAll = true;
    try {
      await Promise.all([
        ...run.buildTasks.filter((t) => t.buildId).map((t) => this.refreshModalBuildTask(run, t)),
        ...run.deployTasks.filter((t) => t.releaseId).map((t) => this.refreshModalDeployTask(run, t)),
      ]);
    } finally {
      this.modalRefreshingAll = false;
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  // ── Open / Restore history run as active view ─────────────
  openHistoryRun(run: DeployHistoryEntry): void {
    this.branchName = run.branch;
    this.selectedServices = new Set<string>(run.services);
    this.selectedEnvironments = new Set<string>(run.environments);
    this.runId = run.id;
    this.runStartedAt = run.startedAt;
    this.isComplete = true;
    this.isRunning = false;
    this.wasInterrupted = run.overallStatus === 'interrupted';
    this.logs = [...run.logs];
    this.steps = run.steps.map((s) => ({ ...s }));
    this.patResult = run.patResult ? { ...run.patResult } : null;
    this.branchTasks = run.branchTasks.map((t) => ({ ...t }));
    this.buildTasks = run.buildTasks.map((t) => ({ ...t }));
    this.deployTasks = run.deployTasks.map((t) => ({ ...t }));
    this.envReservationTasks = run.envReservationTasks.map((t) => ({ ...t }));
    this.expandedHistoryId = null;
    this.showHistory = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Rerun actions from history ────────────────────────────
  rerunAllFromHistory(run: DeployHistoryEntry): void {
    const branch = run.branch;
    const services = new Set<string>(run.services);
    const envs = new Set<string>(run.environments);
    this.reset();
    this.branchName = branch;
    this.selectedServices = services;
    this.selectedEnvironments = envs;
    this.showHistory = false;
    this.run();
  }

  rerunBuildFromHistory(run: DeployHistoryEntry): void {
    this.openHistoryRun(run);
    this.rerunBuildStep();
  }

  rerunDeployFromHistory(run: DeployHistoryEntry): void {
    this.openHistoryRun(run);
    this.rerunDeployStep();
  }

  hasBuildIds(run: DeployHistoryEntry): boolean {
    return run.buildTasks.some((t) => !!t.buildId);
  }

  // ── Per-step rerun for active run ─────────────────────────
  async rerunPatStep(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    const step = this.steps.find((s) => s.id === 'validate-pat');
    if (step) step.status = 'running';
    this.patResult = { service: 'Azure DevOps', status: 'running', message: 'Validating PAT...' };
    this.log('↻ Re-validating PAT...');
    const res = await this.azureDevOps.validatePat();
    if (step) step.status = res.success ? 'success' : 'failed';
    this.patResult = { service: 'Azure DevOps', status: res.success ? 'success' : 'failed', message: res.message };
    this.log(res.message);
    this.isRunning = false;
    this.saveCurrentRun();
  }

  async rerunBranchStep(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    const step = this.steps.find((s) => s.id === 'check-branch');
    if (step) step.status = 'running';
    const branch = this.branchName;
    const services = Array.from(this.selectedServices);
    this.branchTasks = services.map((s) => ({ service: s, status: 'pending' as TaskStatus, message: '' }));
    this.log('↻ Re-checking branch existence...');
    await Promise.all(services.map(async (svc) => {
      const task = this.branchTasks.find((t) => t.service === svc)!;
      task.status = 'running';
      const res = await this.azureDevOps.checkBranchExists(svc, '', branch);
      task.status = res.exists ? 'success' : 'failed';
      task.message = res.message;
      this.log(`[${svc}] ${res.message}`);
    }));
    const failed = this.branchTasks.some((t) => t.status === 'failed');
    if (step) step.status = failed ? 'failed' : 'success';
    this.isRunning = false;
    this.saveCurrentRun();
  }

  async rerunEnvStep(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    const step = this.steps.find((s) => s.id === 'check-env');
    if (step) step.status = 'running';
    const envs = Array.from(this.selectedEnvironments);
    const today = new Date().toISOString().split('T')[0];
    this.envReservationTasks = envs.map((env) => ({ env, status: 'pending' as TaskStatus, message: '', deployments: [] }));
    this.log('↻ Re-checking environment reservations...');
    for (const task of this.envReservationTasks) {
      task.status = 'running';
      const active = this.allReservations.filter(
        (r) => r.environment.toLowerCase() === task.env.toLowerCase() && r.startDate <= today && r.endDate >= today
      );
      if (active.length > 0) {
        task.status = 'warning';
        const names = active.map((r) => r.userName).join(', ');
        task.message = `Reserved by: ${names}`;
        this.log(`[${task.env}] ⚠ Reserved by ${names}`);
      } else {
        task.status = 'success';
        task.message = 'Available';
        this.log(`[${task.env}] ✓ Available`);
      }
    }
    const anyWarning = this.envReservationTasks.some((t) => t.status === 'warning');
    if (step) step.status = anyWarning ? 'warning' : 'success';
    this.isRunning = false;
    this.saveCurrentRun();
  }

  overallStatus(): TaskStatus {
    if (!this.steps.length) return 'pending';
    if (this.steps.some((s) => s.status === 'failed')) return 'failed';
    if (this.steps.some((s) => s.status === 'running')) return 'running';
    if (this.steps.every((s) => s.status === 'success' || s.status === 'skipped')) return 'success';
    return 'pending';
  }
}
