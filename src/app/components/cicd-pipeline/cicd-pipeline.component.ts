import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription, filter, take } from 'rxjs';
import {
  MICROSERVICES,
  RELEASE_ENVIRONMENTS,
  PipelineStep,
  PipelineRunRecord,
  ServiceStepResult,
  StepStatus,
  isLibraryService,
  getReleaseBranch,
} from '../../models/release-pipeline.model';
import { AzureDevOpsService } from '../../services/azure-devops.service';
import { PipelineHistoryService } from '../../services/pipeline-history.service';
import { AuthService } from '../../services/auth.service';
import { RunPresenceService, RunViewer } from '../../services/run-presence.service';

@Component({
  selector: 'app-cicd-pipeline',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './cicd-pipeline.component.html',
  styleUrl: './cicd-pipeline.component.css',
})
export class CicdPipelineComponent implements OnInit, OnDestroy {
  microservices = MICROSERVICES;
  environments = RELEASE_ENVIRONMENTS;

  // Config
  pat = '';
  organization = 'vfuk-digital';
  project = 'Digital';
  isConfigured = false;

  // Form
  selectedServices: Set<string> = new Set();
  releaseNumber = '';
  releaseEnvironment = '';

  // Pipeline state
  isRunning = false;
  pipelineStarted = false;
  pipelineCancelled = false;
  currentStepIndex = -1;
  steps: PipelineStep[] = [];
  logs: string[] = [];
  loadingHistory = true;

  // Step-level refresh/rerun tracking
  stepRefreshing: Set<number> = new Set();
  stepRerunning: Set<number> = new Set();

  // Approval gate for Deploy Release step
  waitingForApproval = false;
  private approvalResolver: (() => void) | null = null;

  // Current user UID (for ownership checks)
  private currentUserUid: string | null = null;

  // Sub-tabs in pipeline panel
  pipelineSubTab: 'run' | 'logs' | 'history' = 'run';

  // Run history (from Firebase)
  private authService = inject(AuthService);
  private historyService = inject(PipelineHistoryService);
  private historySub?: Subscription;
  private currentRunId: string | null = null;
  private resumeAttempted = false;
  runHistory: PipelineRunRecord[] = [];
  viewingRun: PipelineRunRecord | null = null;

  // Run ID from URL (for deep-linking to a specific run)
  private pendingRunId: string | null = null;

  // Concurrent viewers
  private presenceService = inject(RunPresenceService);
  runViewers: RunViewer[] = [];
  private viewersSub?: Subscription;

  private routeSub?: Subscription;

  constructor(
    private azureDevOps: AzureDevOpsService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
  ) {}

  ngOnInit(): void {
    // Restore Azure DevOps PAT config immediately (don't wait for Firestore)
    if (this.azureDevOps.restoreConfig()) {
      this.isConfigured = true;
    }

    // Subscribe to concurrent viewers
    this.viewersSub = this.presenceService.viewers$.subscribe(
      (viewers) => (this.runViewers = viewers)
    );

    // Sync sub-tab and runId from route params
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const tab = params.get('subTab');
      const runId = params.get('runId');

      if (runId) {
        // Deep-link to a specific run: /pipeline/run/:runId
        this.pipelineSubTab = 'run';
        this.pendingRunId = runId;
        // If history is already loaded, open the run immediately
        this.tryOpenPendingRun();
      } else if (tab === 'logs' || tab === 'history' || tab === 'run') {
        this.pipelineSubTab = tab;
      } else {
        this.pipelineSubTab = 'run';
      }
    });

    // Wait for anonymous auth to be ready, then subscribe to Firestore
    this.authService.user$
      .pipe(filter((user) => !!user), take(1))
      .subscribe((user) => {
        this.currentUserUid = user!.uid;
        this.subscribeToHistory();
      });
  }

  private subscribeToHistory(): void {
    this.historySub = this.historyService.getRuns$().subscribe({
      next: (runs) => {
        this.loadingHistory = false;
        // Only update local list if we're not actively running (avoid overwriting live state)
        if (!this.isRunning) {
          this.runHistory = runs;
        } else {
          // Merge: keep current running record, update the rest
          const currentId = this.currentRunId;
          this.runHistory = runs.map((r) =>
            r.id === currentId ? (this.runHistory.find((h) => h.id === currentId) || r) : r
          );
        }

        // On first load, try to resume a running pipeline
        if (!this.resumeAttempted) {
          this.resumeAttempted = true;
          this.tryRestoreAndResume();
        }

        // If there's a pending runId from URL, open it
        this.tryOpenPendingRun();
      },
      error: (err) => {
        console.warn('Firestore pipeline-runs subscription error:', err);
        this.loadingHistory = false;
        if (!this.resumeAttempted) {
          this.resumeAttempted = true;
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.historySub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.viewersSub?.unsubscribe();
    this.presenceService.leaveRun();
  }

  /** Save PAT config */
  saveConfig(): void {
    if (!this.pat.trim()) return;
    this.azureDevOps.configure({
      organization: this.organization,
      project: this.project,
      pat: this.pat.trim(),
    });
    this.azureDevOps.persistConfig();
    this.isConfigured = true;
    this.addLog('Azure DevOps configured successfully.');
  }

  /** Toggle service selection */
  toggleService(service: string): void {
    if (this.selectedServices.has(service)) {
      this.selectedServices.delete(service);
    } else {
      this.selectedServices.add(service);
    }
  }

  selectAllServices(): void {
    if (this.selectedServices.size === this.microservices.length) {
      this.selectedServices.clear();
    } else {
      this.microservices.forEach((s) => this.selectedServices.add(s));
    }
  }

  isAllSelected(): boolean {
    return this.selectedServices.size === this.microservices.length;
  }

  /** Validate form */
  canStart(): boolean {
    return (
      this.isConfigured &&
      this.selectedServices.size > 0 &&
      !!this.releaseNumber.trim() &&
      !!this.releaseEnvironment &&
      !this.isRunning &&
      !this.hasOtherUserRunning()
    );
  }

  /** Returns true if another user has a running pipeline */
  hasOtherUserRunning(): boolean {
    const running = this.runHistory.find((r) => r.status === 'running');
    if (!running) return false;
    return !this.isRunOwner(running);
  }

  /** Returns the running record owned by another user (for display) */
  getOtherUserRunning(): PipelineRunRecord | null {
    const running = this.runHistory.find((r) => r.status === 'running');
    if (!running || this.isRunOwner(running)) return null;
    return running;
  }

  /** Check if the current user can approve (only the run creator) */
  canApprove(): boolean {
    if (!this.waitingForApproval || !this.currentRunId) return false;
    const run = this.runHistory.find((r) => r.id === this.currentRunId);
    return this.isRunOwner(run);
  }

  /** Initialize pipeline steps */
  private initSteps(): void {
    const services = Array.from(this.selectedServices);
    const makeResults = (): ServiceStepResult[] =>
      services.map((s) => ({ service: s, status: 'pending' as StepStatus }));

    // For the parallel build step, we need two results per service (release + master)
    const makeBuildResults = (): ServiceStepResult[] =>
      services.flatMap((s) => [
        { service: `${s} (release)`, status: 'pending' as StepStatus },
        { service: `${s} (master)`, status: 'pending' as StepStatus },
      ]);

    this.steps = [
      {
        id: 'create-branch',
        label: 'Create Release Branch',
        description: `Create release branch (mvax-common from develop → primary/${this.releaseNumber}; others from release/develop → release/primary/${this.releaseNumber})`,
        status: 'pending',
        results: makeResults(),
      },
      {
        id: 'create-pr',
        label: 'Create Pull Request',
        description: `PR from release branch → master`,
        status: 'pending',
        results: makeResults(),
      },
      {
        id: 'build-both',
        label: 'Build Release & Master',
        description: `Build release branch and master in parallel`,
        status: 'pending',
        results: makeBuildResults(),
      },
      {
        id: 'deploy-master',
        label: 'Deploy Master Build',
        description: `Deploy master build to ${this.releaseEnvironment.toUpperCase()}`,
        status: 'pending',
        results: makeResults(),
      },
      {
        id: 'deploy-release',
        label: 'Deploy Release Build',
        description: `Deploy release build to ${this.releaseEnvironment.toUpperCase()}`,
        status: 'pending',
        results: makeResults(),
      },
    ];
  }

  /** Run the full pipeline */
  async startPipeline(): Promise<void> {
    if (!this.canStart()) return;

    this.pipelineStarted = true;
    this.isRunning = true;
    this.pipelineCancelled = false;
    this.viewingRun = null;
    this.logs = [];
    this.initSteps();
    this.addLog(`Pipeline started: Release ${this.releaseNumber} → ${this.releaseEnvironment.toUpperCase()}`);

    // Create run record
    const runId = crypto.randomUUID();
    this.currentRunId = runId;
    // Track presence so other users see this run is being monitored
    this.presenceService.joinRun(runId);
    const runRecord: PipelineRunRecord = {
      id: runId,
      releaseNumber: this.releaseNumber.trim(),
      environment: this.releaseEnvironment,
      services: Array.from(this.selectedServices),
      status: 'running',
      startedAt: new Date().toISOString(),
      currentStepIndex: 0,
      steps: JSON.parse(JSON.stringify(this.steps)),
      logs: [...this.logs],
      createdBy: this.currentUserUid || undefined,
    };
    this.runHistory.unshift(runRecord);
    try {
      await this.historyService.saveRun(runRecord);
      this.addLog('Run record saved to Firebase.');
    } catch (err: any) {
      const msg = err?.message || err?.code || String(err);
      console.error('Failed to save run to Firestore:', err);
      this.addLog(`⚠ Firebase save failed: ${msg}`);
    }

    const services = Array.from(this.selectedServices);
    const relNum = this.releaseNumber.trim();

    // Track build IDs per service
    const releaseBuildIds: Map<string, number> = new Map();
    const masterBuildIds: Map<string, number> = new Map();

    // ── Step 1: Create branches (mvax-common uses primary/{relNum} from develop; others use release/primary/{relNum} from release/develop) ──
    await this.runStep(0, services, async (svc, result) => {
      const branch = getReleaseBranch(svc, relNum);
      this.addLog(`[${svc}] Creating branch ${branch}...`);
      const res = await this.azureDevOps.createBranch(svc, relNum, branch);
      result.status = res.success ? 'success' : 'failed';
      result.message = res.message;
      this.addLog(`[${svc}] ${res.message}`);
    });

    if (this.pipelineCancelled) return;

    if (this.steps[0].status === 'failed') {
      this.addLog('Pipeline stopped: branch creation failed.');
      await this.finalizeRunRecord('failed');
      this.isRunning = false;
      return;
    }

    // ── Step 2: Create PRs ──
    await this.runStep(1, services, async (svc, result) => {
      const branch = getReleaseBranch(svc, relNum);
      this.addLog(`[${svc}] Creating PR ${branch} → master...`);
      const res = await this.azureDevOps.createPullRequest(svc, relNum, branch);
      result.status = res.success ? 'success' : 'failed';
      result.message = res.message;
      result.prUrl = res.prUrl;
      this.addLog(`[${svc}] ${res.message}`);
    });

    if (this.pipelineCancelled) return;

    // ── Step 3: Build release & master in parallel ──
    await this.runParallelBuildStep(2, services, relNum, releaseBuildIds, masterBuildIds);

    if (this.pipelineCancelled) return;

    // Stop if any build failed
    if (this.steps[2].status === 'failed') {
      this.addLog('Pipeline stopped: one or more builds failed.');
      await this.finalizeRunRecord('failed');
      this.isRunning = false;
      return;
    }

    // ── Step 4: Deploy master build (skip library services) ──
    await this.runStep(3, services, async (svc, result) => {
      if (isLibraryService(svc)) {
        result.status = 'skipped';
        result.message = 'Library — no deployment needed';
        this.addLog(`[${svc}] Skipped (library)`);
        return;
      }
      // Read master build ID directly from build step results (ground truth)
      const masterBuildResult = this.steps[2]?.results.find(
        (r) => r.service === `${svc} (master)` && r.status === 'success' && r.buildId
      );
      const buildId = masterBuildResult?.buildId ?? masterBuildIds.get(svc);
      if (!buildId) {
        result.status = 'skipped';
        result.message = 'No master build ID';
        return;
      }
      this.addLog(`[${svc}] Deploying master build #${buildId}...`);
      const res = await this.azureDevOps.deploy(buildId, this.releaseEnvironment, svc);
      if (!res.success) {
        result.status = 'failed';
        result.message = res.message;
        this.addLog(`[${svc}] ${res.message}`);
        return;
      }
      result.sourceBuildId = buildId;
      result.releaseId = res.releaseId;
      result.releaseUrl = res.releaseUrl;
      result.releaseEnvironment = res.releaseEnvironment;
      result.message = res.message;
      this.addLog(`[${svc}] ${res.message}`);
      this.persistRunningState();

      // Wait for deployment to actually complete
      if (res.releaseId) {
        this.addLog(`[${svc}] Waiting for master deployment #${res.releaseId} to complete...`);
        const waitRes = await this.azureDevOps.waitForDeployment(
          res.releaseId,
          res.releaseEnvironment || this.releaseEnvironment,
          (status) => { result.message = status; }
        );
        result.status = waitRes.success ? 'success' : 'failed';
        result.message = waitRes.message;
        this.addLog(`[${svc}] ${waitRes.message}`);
      } else {
        result.status = 'success';
      }
    });

    // Stop if master deploy failed
    if (this.steps[3].status === 'failed') {
      this.addLog('Pipeline stopped: master deployment failed.');
      await this.finalizeRunRecord('failed');
      this.isRunning = false;
      return;
    }

    if (this.pipelineCancelled) return;

    // ── Wait for manual approval before Step 5 ──
    this.steps[4].status = 'waiting-approval';
    this.currentStepIndex = 4;
    this.waitingForApproval = true;
    this.addLog('⏸ Waiting for user approval to deploy release build...');
    this.persistRunningState();
    await new Promise<void>((resolve) => {
      this.approvalResolver = resolve;
    });
    this.waitingForApproval = false;

    if (this.pipelineCancelled) return;

    this.addLog('✓ Release deploy approved by user.');
    // Mark step as running and persist immediately — so a page refresh after approval
    // won't find 'waiting-approval' in Firestore and re-prompt for approval.
    this.steps[4].status = 'running';
    await this.persistRunningState();

    // ── Step 5: Deploy release build (skip library services) ──
    await this.runStep(4, services, async (svc, result) => {
      if (isLibraryService(svc)) {
        result.status = 'skipped';
        result.message = 'Library — no deployment needed';
        this.addLog(`[${svc}] Skipped (library)`);
        return;
      }
      // Read release build ID directly from build step results (ground truth)
      const releaseBuildResult = this.steps[2]?.results.find(
        (r) => r.service === `${svc} (release)` && r.status === 'success' && r.buildId
      );
      const buildId = releaseBuildResult?.buildId ?? releaseBuildIds.get(svc);
      if (!buildId) {
        result.status = 'skipped';
        result.message = 'No release build ID';
        return;
      }
      this.addLog(`[${svc}] Deploying release build #${buildId}...`);
      const res = await this.azureDevOps.deploy(buildId, this.releaseEnvironment, svc);
      if (!res.success) {
        result.status = 'failed';
        result.message = res.message;
        this.addLog(`[${svc}] ${res.message}`);
        return;
      }
      result.sourceBuildId = buildId;
      result.releaseId = res.releaseId;
      result.releaseUrl = res.releaseUrl;
      result.releaseEnvironment = res.releaseEnvironment;
      result.message = res.message;
      this.addLog(`[${svc}] ${res.message}`);
      this.persistRunningState();

      // Wait for deployment to actually complete
      if (res.releaseId) {
        this.addLog(`[${svc}] Waiting for release deployment #${res.releaseId} to complete...`);
        const waitRes = await this.azureDevOps.waitForDeployment(
          res.releaseId,
          res.releaseEnvironment || this.releaseEnvironment,
          (status) => { result.message = status; }
        );
        result.status = waitRes.success ? 'success' : 'failed';
        result.message = waitRes.message;
        this.addLog(`[${svc}] ${waitRes.message}`);
      } else {
        result.status = 'success';
      }
    });

    this.addLog('Pipeline complete.');
    await this.finalizeRunRecord('success');
    this.isRunning = false;
  }

  /** Execute a step for all services */
  private async runStep(
    stepIndex: number,
    services: string[],
    action: (service: string, result: ServiceStepResult) => Promise<void>
  ): Promise<void> {
    if (this.pipelineCancelled) return;
    this.currentStepIndex = stepIndex;
    const step = this.steps[stepIndex];
    step.status = 'running';

    for (const svc of services) {
      if (this.pipelineCancelled) break;
      const result = step.results.find((r) => r.service === svc);
      if (!result) continue;
      result.status = 'running';
      try {
        await action(svc, result);
      } catch (e: any) {
        result.status = 'failed';
        result.message = e.message || String(e);
        this.addLog(`[${svc}] Error: ${result.message}`);
      }
    }

    if (this.pipelineCancelled) return;
    const hasFailure = step.results.some((r) => r.status === 'failed');
    const allSkipped = step.results.every((r) => r.status === 'skipped');
    step.status = hasFailure ? 'failed' : allSkipped ? 'skipped' : 'success';
    this.persistRunningState();
  }

  /** Execute parallel build step: release and master branches built concurrently per service */
  private async runParallelBuildStep(
    stepIndex: number,
    services: string[],
    relNum: string,
    releaseBuildIds: Map<string, number>,
    masterBuildIds: Map<string, number>
  ): Promise<void> {
    this.currentStepIndex = stepIndex;
    const step = this.steps[stepIndex];
    step.status = 'running';

    // Build a single service for both branches in parallel
    const buildService = async (svc: string) => {
      const releaseResult = step.results.find((r) => r.service === `${svc} (release)`);
      const masterResult = step.results.find((r) => r.service === `${svc} (master)`);

      const buildBranch = async (
        branch: string,
        label: string,
        result: ServiceStepResult | undefined,
        buildMap: Map<string, number>
      ) => {
        if (!result) return;
        result.status = 'running';
        try {
          this.addLog(`[${svc}] Queuing ${label} build for ${branch}...`);
          const res = await this.azureDevOps.queueBuild(svc, branch);
          if (!res.success) {
            result.status = 'failed';
            result.message = res.message;
            this.addLog(`[${svc}] ${label}: ${result.message}`);
            return;
          }
          // Keep status as 'running' until build actually completes
          result.status = 'running';
          result.message = res.message;
          result.buildId = res.buildId;
          result.buildUrl = res.buildUrl;
          if (res.buildId) {
            buildMap.set(svc, res.buildId);
            this.persistRunningState();
            this.addLog(`[${svc}] Waiting for ${label} build #${res.buildId}...`);
            const waitRes = await this.azureDevOps.waitForBuild(res.buildId, (status) => {
              result.message = status;
            });
            result.status = waitRes.success ? 'success' : 'failed';
            result.message = waitRes.message;
          }
          this.addLog(`[${svc}] ${label}: ${result.message}`);
        } catch (e: any) {
          result.status = 'failed';
          result.message = e.message || String(e);
          this.addLog(`[${svc}] ${label} Error: ${result.message}`);
        }
      };

      // Run release and master builds for this service in parallel
      const svcBranch = getReleaseBranch(svc, relNum);
      await Promise.all([
        buildBranch(svcBranch, 'release', releaseResult, releaseBuildIds),
        buildBranch('master', 'master', masterResult, masterBuildIds),
      ]);
    };

    // Run all services in parallel too
    await Promise.all(services.map((svc) => buildService(svc)));

    const hasFailure = step.results.some((r) => r.status === 'failed');
    const allSkipped = step.results.every((r) => r.status === 'skipped');
    step.status = hasFailure ? 'failed' : allSkipped ? 'skipped' : 'success';
    this.persistRunningState();
  }

  /** Add entry to the log panel */
  private addLog(msg: string): void {
    const ts = new Date().toLocaleTimeString();
    this.logs.push(`[${ts}] ${msg}`);
  }

  /** Reset pipeline to start over */
  resetPipeline(): void {
    this.pipelineStarted = false;
    this.isRunning = false;
    this.pipelineCancelled = false;
    this.currentStepIndex = -1;
    this.steps = [];
    this.logs = [];
    this.viewingRun = null;
  }

  /** Stop a running pipeline (only the creator can do this) */
  async stopPipeline(): Promise<void> {
    if (!this.isRunning) return;
    // Check ownership
    const run = this.currentRunId ? this.runHistory.find((r) => r.id === this.currentRunId) : null;
    if (run && !this.isRunOwner(run)) return;

    this.pipelineCancelled = true;
    this.addLog('⛔ Pipeline stopped by user.');

    // If waiting for approval, reject it so the promise resolves
    if (this.approvalResolver) {
      this.approvalResolver();
      this.approvalResolver = null;
    }

    this.isRunning = false;
    this.waitingForApproval = false;

    // Mark remaining running/pending steps as failed
    for (const step of this.steps) {
      if (step.status === 'running' || step.status === 'pending' || step.status === 'waiting-approval') {
        step.status = 'failed';
        for (const r of step.results) {
          if (r.status === 'running' || r.status === 'pending') {
            r.status = 'failed';
            r.message = 'Stopped by user';
          }
        }
      }
    }

    await this.finalizeRunRecord('failed');
  }

  /** Allow user to change/reconfigure PAT token */
  changeConfig(): void {
    this.isConfigured = false;
    this.pat = '';
  }

  /** Check if the current user can stop the running pipeline */
  canStop(): boolean {
    if (!this.isRunning || !this.currentRunId) return false;
    const run = this.runHistory.find((r) => r.id === this.currentRunId);
    return this.isRunOwner(run);
  }

  // ─── Run History (Firebase) ─────────────────────────────────────

  private async finalizeRunRecord(status: 'success' | 'failed'): Promise<void> {
    const record = this.currentRunId
      ? this.runHistory.find((r) => r.id === this.currentRunId)
      : this.runHistory.find((r) => r.status === 'running');
    if (!record) return;
    record.status = status;
    record.completedAt = new Date().toISOString();
    record.currentStepIndex = this.currentStepIndex;
    record.steps = JSON.parse(JSON.stringify(this.steps));
    record.logs = [...this.logs];
    try {
      await this.historyService.saveRun(record);
    } catch (err: any) {
      const msg = err?.message || err?.code || String(err);
      console.error('Failed to finalize run in Firestore:', err);
      this.addLog(`⚠ Firebase finalize failed: ${msg}`);
    }
  }

  /** Persist current running pipeline state to Firebase */
  private async persistRunningState(): Promise<void> {
    const record = this.currentRunId
      ? this.runHistory.find((r) => r.id === this.currentRunId)
      : this.runHistory.find((r) => r.status === 'running');
    if (!record) return;
    record.currentStepIndex = this.currentStepIndex;
    record.steps = JSON.parse(JSON.stringify(this.steps));
    record.logs = [...this.logs];
    // Fire-and-forget save to avoid blocking the pipeline
    this.historyService.saveRun(record).catch((err: any) => {
      console.error('Failed to persist state to Firestore:', err);
    });
  }

  /** Check if the current user owns a given run */
  isRunOwner(run?: PipelineRunRecord | null): boolean {
    if (!run || !this.currentUserUid) return false;
    // Runs without createdBy (legacy) are owned by everyone
    if (!run.createdBy) return true;
    return run.createdBy === this.currentUserUid;
  }

  /** On page load, check for any running pipeline and resume tracking */
  private tryRestoreAndResume(): void {
    // Find any running pipeline from Firestore
    const running = this.runHistory.find((r) => r.status === 'running');
    if (!running || !this.isConfigured) return;

    // If the running record is older than 2 hours, mark it as failed (stale)
    const ageMs = Date.now() - new Date(running.startedAt).getTime();
    if (ageMs > 2 * 60 * 60 * 1000) {
      running.status = 'failed';
      running.completedAt = new Date().toISOString();
      this.historyService.saveRun({ ...running }).catch(() => {});
      this.addLog(`Stale pipeline run (Release ${running.releaseNumber}) marked as failed.`);
      return;
    }

    // Only the user who created the run can resume execution
    if (!this.isRunOwner(running)) {
      this.addLog(`A pipeline run (Release ${running.releaseNumber}) is in progress — started by another user. You can view it in Run History.`);
      return;
    }

    // Restore UI state
    this.pipelineStarted = true;
    this.isRunning = true;
    this.currentRunId = running.id;
    this.steps = JSON.parse(JSON.stringify(running.steps));
    this.logs = [...(running.logs || [])];
    this.currentStepIndex = running.currentStepIndex;
    this.releaseNumber = running.releaseNumber;
    this.releaseEnvironment = running.environment;
    this.selectedServices = new Set(running.services);

    this.addLog('Page reloaded — resuming pipeline tracking...');
    this.resumePipeline(running).catch((err) => {
      console.error('Resume pipeline failed:', err);
      this.addLog(`Resume failed: ${err.message || err}`);
      this.isRunning = false;
      this.finalizeRunRecord('failed');
    });
  }

  /** Resume tracking a running pipeline after page refresh */
  private async resumePipeline(record: PipelineRunRecord): Promise<void> {
    const services = record.services;
    const env = record.environment;

    // Rebuild build ID maps from saved step results
    const releaseBuildIds: Map<string, number> = new Map();
    const masterBuildIds: Map<string, number> = new Map();
    const buildStep = this.steps.find((s) => s.id === 'build-both');
    if (buildStep) {
      for (const r of buildStep.results) {
        if (r.buildId) {
          const match = r.service.match(/^(.+?)\s+\((release|master)\)$/);
          if (match) {
            if (match[2] === 'release') releaseBuildIds.set(match[1], r.buildId);
            else masterBuildIds.set(match[1], r.buildId);
          }
        }
      }
    }

    // Find where we left off
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];

      // For build step, ALWAYS verify actual status if it has buildIds (saved state may be stale)
      if (step.id === 'build-both' && step.results.some((r) => r.buildId)) {
        this.currentStepIndex = i;
        step.status = 'running';

        // Verify and wait for ALL builds that have a buildId, regardless of saved status
        const buildPromises = step.results
          .filter((r) => r.buildId)
          .map(async (result) => {
            const match = result.service.match(/^(.+?)\s+\((release|master)\)$/);

            // First, check if the build is actually done already
            this.addLog(`[${result.service}] Checking build #${result.buildId} status...`);
            const check = await this.azureDevOps.checkBuildStatus(result.buildId!);

            if (check.done) {
              // Build already finished — use actual result
              result.status = check.success ? 'success' : 'failed';
              result.message = `Build #${result.buildId} ${check.result || (check.success ? 'succeeded' : 'failed')}`;
              this.addLog(`[${result.service}] ${result.message}`);
            } else {
              // Build still in progress — wait for it
              result.status = 'running';
              this.addLog(`[${result.service}] Build #${result.buildId} still ${check.status}, waiting...`);
              const waitRes = await this.azureDevOps.waitForBuild(result.buildId!, (s) => { result.message = s; });
              result.status = waitRes.success ? 'success' : 'failed';
              result.message = waitRes.message;
              this.addLog(`[${result.service}] ${waitRes.message}`);
            }

            if (match && result.buildId) {
              if (match[2] === 'release') releaseBuildIds.set(match[1], result.buildId);
              else masterBuildIds.set(match[1], result.buildId);
            }
          });
        await Promise.all(buildPromises);

        const hasFailure = step.results.some((r) => r.status === 'failed');
        step.status = hasFailure ? 'failed' : 'success';
        this.persistRunningState();

        if (hasFailure) {
          this.addLog('Pipeline stopped: one or more builds failed.');
          await this.finalizeRunRecord('failed');
          this.isRunning = false;
          return;
        }
        continue;
      }

      // Skip completed/failed/skipped steps (non-build)
      if (step.status === 'success' || step.status === 'failed' || step.status === 'skipped') continue;

      this.currentStepIndex = i;

      // ── Deploy Release step: require approval before running ──
      // Only gate on 'waiting-approval' or 'pending' — if status is already 'running',
      // the user already approved before the page refresh; skip straight to deploy resume.
      if (step.id === 'deploy-release' && (step.status === 'waiting-approval' || step.status === 'pending')) {
        // If deploy-master succeeded, wait for user approval before proceeding
        const masterStep = this.steps.find((s) => s.id === 'deploy-master');
        if (masterStep && masterStep.status === 'success') {
          step.status = 'waiting-approval';
          this.waitingForApproval = true;
          this.addLog('⏸ Waiting for user approval to deploy release build...');
          this.persistRunningState();
          await new Promise<void>((resolve) => {
            this.approvalResolver = resolve;
          });
          this.waitingForApproval = false;
          this.addLog('✓ Release deploy approved by user.');
          // Mark as running and persist immediately — prevents re-prompting on refresh
          step.status = 'running';
          await this.persistRunningState();
        }
      }

      // ── Deploy steps: check for in-progress deployments ──
      if (step.id === 'deploy-master' || step.id === 'deploy-release') {
        const buildMap = step.id === 'deploy-master' ? masterBuildIds : releaseBuildIds;
        const label = step.id === 'deploy-master' ? 'master' : 'release';
        step.status = 'running';

        for (const result of step.results) {
          const svc = result.service;

          // Skip library services — they don't need deployment
          if (isLibraryService(svc)) {
            result.status = 'skipped';
            result.message = 'Library — no deployment needed';
            this.addLog(`[${svc}] Skipped (library)`);
            continue;
          }

          // If deployment was already created, just resume waiting
          if (result.releaseId && (result.status === 'running' || result.status === 'pending')) {
            result.status = 'running';
            this.addLog(`[${svc}] Resuming ${label} deployment #${result.releaseId} tracking...`);
            const waitRes = await this.azureDevOps.waitForDeployment(
              result.releaseId,
              result.releaseEnvironment || env,
              (s) => { result.message = s; }
            );
            result.status = waitRes.success ? 'success' : 'failed';
            result.message = waitRes.message;
            this.addLog(`[${svc}] ${waitRes.message}`);
            continue;
          }

          // If not yet deployed, create the deployment
          if (result.status !== 'success' && result.status !== 'failed') {
            // Read build ID directly from build step results (ground truth), fall back to map
            const buildVariant = step.id === 'deploy-master' ? 'master' : 'release';
            const buildStepResult = this.steps[2]?.results.find(
              (r) => r.service === `${svc} (${buildVariant})` && r.status === 'success' && r.buildId
            );
            const buildId = buildStepResult?.buildId ?? buildMap.get(svc);
            if (!buildId) {
              result.status = 'skipped';
              result.message = `No ${label} build ID`;
              continue;
            }
            result.status = 'running';
            this.addLog(`[${svc}] Deploying ${label} build #${buildId}...`);
            const res = await this.azureDevOps.deploy(buildId, env, svc);
            if (!res.success) {
              result.status = 'failed';
              result.message = res.message;
              this.addLog(`[${svc}] ${res.message}`);
              continue;
            }
            result.releaseId = res.releaseId;
            result.releaseUrl = res.releaseUrl;
            result.releaseEnvironment = res.releaseEnvironment;
            result.message = res.message;
            this.addLog(`[${svc}] ${res.message}`);
            this.persistRunningState();

            if (res.releaseId) {
              this.addLog(`[${svc}] Waiting for ${label} deployment #${res.releaseId} to complete...`);
              const waitRes = await this.azureDevOps.waitForDeployment(
                res.releaseId,
                res.releaseEnvironment || env,
                (s) => { result.message = s; }
              );
              result.status = waitRes.success ? 'success' : 'failed';
              result.message = waitRes.message;
              this.addLog(`[${svc}] ${waitRes.message}`);
            } else {
              result.status = 'success';
            }
          }
        }

        const hasFailure = step.results.some((r) => r.status === 'failed');
        const allSkipped = step.results.every((r) => r.status === 'skipped');
        step.status = hasFailure ? 'failed' : allSkipped ? 'skipped' : 'success';
        this.persistRunningState();

        if (hasFailure && step.id === 'deploy-master') {
          this.addLog('Pipeline stopped: master deployment failed.');
          await this.finalizeRunRecord('failed');
          this.isRunning = false;
          return;
        }
        continue;
      }

      // ── Steps 1 & 2 (branch/PR): verify status from Azure DevOps and retry if needed ──
      if (step.id === 'create-branch' && (step.status === 'running' || step.status === 'pending')) {
        step.status = 'running';
        const relNum = record.releaseNumber;
        for (const result of step.results) {
          if (result.status === 'success') continue;
          result.status = 'running';
          const branchName = getReleaseBranch(result.service, relNum);
          this.addLog(`[${result.service}] Checking if branch ${branchName} exists...`);
          const check = await this.azureDevOps.checkBranchExists(result.service, relNum, branchName);
          if (check.exists) {
            result.status = 'success';
            result.message = check.message;
            this.addLog(`[${result.service}] ✓ ${check.message}`);
          } else {
            // Branch doesn't exist — try to create it
            this.addLog(`[${result.service}] Branch not found, creating...`);
            const res = await this.azureDevOps.createBranch(result.service, relNum, branchName);
            result.status = res.success ? 'success' : 'failed';
            result.message = res.message;
            this.addLog(`[${result.service}] ${res.message}`);
          }
        }
        const hasFailure = step.results.some((r) => r.status === 'failed');
        step.status = hasFailure ? 'failed' : 'success';
        this.persistRunningState();
        if (hasFailure) {
          this.addLog('Pipeline stopped: branch creation failed on resume.');
          await this.finalizeRunRecord('failed');
          this.isRunning = false;
          return;
        }
        continue;
      }

      if (step.id === 'create-pr' && (step.status === 'running' || step.status === 'pending')) {
        step.status = 'running';
        const relNum = record.releaseNumber;
        for (const result of step.results) {
          if (result.status === 'success') continue;
          result.status = 'running';
          const branchName = getReleaseBranch(result.service, relNum);
          this.addLog(`[${result.service}] Checking if PR already exists...`);
          const check = await this.azureDevOps.findExistingPR(result.service, relNum, branchName);
          if (check.exists) {
            result.status = 'success';
            result.message = check.message;
            result.prUrl = check.prUrl;
            this.addLog(`[${result.service}] ✓ ${check.message}`);
          } else {
            // PR doesn't exist — try to create it
            this.addLog(`[${result.service}] No PR found, creating...`);
            const res = await this.azureDevOps.createPullRequest(result.service, relNum, branchName);
            result.status = res.success ? 'success' : 'failed';
            result.message = res.message;
            result.prUrl = res.prUrl;
            this.addLog(`[${result.service}] ${res.message}`);
          }
        }
        const hasFailure = step.results.some((r) => r.status === 'failed');
        step.status = hasFailure ? 'failed' : 'success';
        this.persistRunningState();
        if (hasFailure) {
          this.addLog('Pipeline stopped: PR creation failed on resume.');
          await this.finalizeRunRecord('failed');
          this.isRunning = false;
          return;
        }
        continue;
      }
    }

    this.addLog('Pipeline complete (resumed).');
    await this.finalizeRunRecord('success');
    this.isRunning = false;
  }

  /** Open a past run in the stepper panel */
  viewRun(run: PipelineRunRecord): void {
    // If this is the currently-running pipeline, just switch to the run tab
    // without overwriting the live steps/logs with a stale Firestore snapshot
    if (this.isRunning && run.id === this.currentRunId) {
      this.pipelineSubTab = 'run';
      this.location.replaceState('/pipeline/run/' + run.id);
      return;
    }
    this.viewingRun = run;
    this.pipelineStarted = true;
    this.steps = JSON.parse(JSON.stringify(run.steps));
    this.logs = [...(run.logs || [])];
    this.currentStepIndex = run.currentStepIndex ?? run.steps.length - 1;
    // Update URL to reflect the viewed run (without full navigation to avoid component recreation)
    this.location.replaceState('/pipeline/run/' + run.id);
    this.pipelineSubTab = 'run';
    // Track presence for concurrent viewer detection
    this.presenceService.joinRun(run.id);
  }

  /** Close run viewer and go back to form */
  closeRunViewer(): void {
    this.viewingRun = null;
    this.pendingRunId = null;
    this.pipelineStarted = false;
    this.steps = [];
    this.logs = [];
    this.currentStepIndex = -1;
    this.location.replaceState('/pipeline/run');
    this.presenceService.leaveRun();
  }

  /** Delete a run from history */
  async deleteRun(run: PipelineRunRecord, event: Event): Promise<void> {
    event.stopPropagation();
    this.runHistory = this.runHistory.filter((r) => r.id !== run.id);
    if (this.viewingRun?.id === run.id) {
      this.closeRunViewer();
    }
    await this.historyService.deleteRun(run.id);
  }

  /** Format ISO date for display */
  formatRunDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  /** Compute duration string */
  formatDuration(start: string, end?: string): string {
    if (!end) return 'In progress';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remSecs = secs % 60;
    return `${mins}m ${remSecs}s`;
  }

  // ── Copy All Links ──────────────────────────────────────────────
  linksCopied = false;

  private getActiveSteps(): PipelineStep[] {
    return this.viewingRun ? this.viewingRun.steps : this.steps;
  }

  getAllLinks(): { label: string; url: string }[] {
    const links: { label: string; url: string }[] = [];
    for (const step of this.getActiveSteps()) {
      for (const result of step.results) {
        if (result.prUrl) {
          links.push({ label: `[PR] ${result.service}`, url: result.prUrl });
        }
        if (result.buildUrl) {
          links.push({ label: `[Build] ${result.service}`, url: result.buildUrl });
        }
        if (result.releaseUrl) {
          links.push({ label: `[Release] ${result.service}`, url: result.releaseUrl });
        }
      }
    }
    return links;
  }

  hasLinks(): boolean {
    return this.getAllLinks().length > 0;
  }

  copyAllLinks(): void {
    const links = this.getAllLinks();
    if (!links.length) return;
    const text = links.map((l) => `${l.label}: ${l.url}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.linksCopied = true;
      setTimeout(() => (this.linksCopied = false), 2500);
    });
  }

  /** UI helper: step icon */
  stepIcon(status: StepStatus): string {
    switch (status) {
      case 'success':
        return '✓';
      case 'failed':
        return '✗';
      case 'running':
        return '●';
      case 'skipped':
        return '–';
      default:
        return '';
    }
  }

  getStepNumber(index: number): number {
    return index + 1;
  }

  /** User clicks the approve button to trigger the release deployment */
  approveReleaseDeploy(): void {
    if (this.approvalResolver) {
      this.approvalResolver();
      this.approvalResolver = null;
    }
  }

  // ─── Per-row Refresh / Rerun ─────────────────────────────────

  /** Refresh the Azure status of a single build or deploy result row */
  async refreshResult(stepIndex: number, result: ServiceStepResult): Promise<void> {
    if (result.refreshing || result.rerunning) return;
    result.refreshing = true;
    try {
      if (result.buildId) {
        // Build step
        const res = await this.azureDevOps.checkBuildStatus(result.buildId);
        const label = res.result || res.status;
        if (res.done) {
          result.status = res.success ? 'success' : 'failed';
          result.message = `Build #${result.buildId} ${label}`;
        } else {
          result.message = `Build #${result.buildId} – ${label}`;
        }
      } else if (result.releaseId) {
        // Deploy step
        const env = result.releaseEnvironment || this.releaseEnvironment;
        const res = await this.azureDevOps.checkDeploymentStatus(result.releaseId, env);
        if (res.done) {
          result.status = res.success ? 'success' : 'failed';
          result.message = `Release #${result.releaseId}: deployment ${res.statusName}`;
        } else {
          result.message = `Release #${result.releaseId}: deployment ${res.statusName}...`;
        }
      }
      await this.persistStepsToHistory();
    } finally {
      result.refreshing = false;
    }
  }

  /** Returns the release number and environment from the current active or viewed run */
  private getActiveRunCtx(): { releaseNumber: string; environment: string } {
    if (this.releaseNumber.trim() && this.releaseEnvironment) {
      return { releaseNumber: this.releaseNumber.trim(), environment: this.releaseEnvironment };
    }
    const runId = this.currentRunId ?? this.viewingRun?.id;
    const record = runId ? this.runHistory.find((r) => r.id === runId) : null;
    if (record) return { releaseNumber: record.releaseNumber, environment: record.environment };
    if (this.viewingRun) return { releaseNumber: this.viewingRun.releaseNumber, environment: this.viewingRun.environment };
    return { releaseNumber: this.releaseNumber.trim(), environment: this.releaseEnvironment };
  }

  /** Re-queue a build or re-create a release for a single result row */
  async rerunResult(stepIndex: number, result: ServiceStepResult): Promise<void> {
    if (result.refreshing || result.rerunning) return;
    result.rerunning = true;
    // Show the run as 'running' while this rerun is in progress
    if (this.viewingRun) this.viewingRun = { ...this.viewingRun, status: 'running' };
    const { releaseNumber: activeRelNum, environment: activeEnv } = this.getActiveRunCtx();
    try {
      if (result.buildId !== undefined || stepIndex === 2) {
        // Build step – service names are "svc (release)" or "svc (master)"
        const isMaster = result.service.endsWith('(master)');
        const svcName = result.service.replace(/ \((release|master)\)$/, '').trim();
        const branch = isMaster ? 'master' : getReleaseBranch(svcName, activeRelNum);
        result.status = 'running';
        result.message = 'Queuing new build...';
        const queueRes = await this.azureDevOps.queueBuild(svcName, branch);
        if (!queueRes.success) {
          result.status = 'failed';
          result.message = queueRes.message;
          return;
        }
        result.buildId = queueRes.buildId;
        result.buildUrl = queueRes.buildUrl;
        result.message = queueRes.message;
        this.addLog(`[${svcName}] Rerun: ${queueRes.message}`);
        if (queueRes.buildId) {
          const waitRes = await this.azureDevOps.waitForBuild(
            queueRes.buildId,
            (m) => { result.message = m; }
          );
          result.status = waitRes.success ? 'success' : 'failed';
          result.message = waitRes.message;
          this.addLog(`[${svcName}] Rerun result: ${waitRes.message}`);
        } else {
          result.status = 'success';
        }
      } else if (result.releaseId !== undefined || stepIndex === 3 || stepIndex === 4) {
        // Deploy step — prefer the latest build from step 2 over the stored sourceBuildId
        const svcName = result.service;
        const buildVariant = stepIndex === 3 ? 'master' : 'release';
        const buildStepResults = this.steps[2]?.results ?? [];
        const latestBuildResult = buildStepResults.find(
          (r) => r.service === `${svcName} (${buildVariant})` && r.status === 'success' && r.buildId
        );
        const buildId = latestBuildResult?.buildId ?? result.sourceBuildId;
        if (!buildId) {
          result.message = 'Cannot rerun: no build ID found — run the build step first';
          return;
        }
        // Keep sourceBuildId in sync so future reruns also use the latest build
        result.sourceBuildId = buildId;
        const env = result.releaseEnvironment || activeEnv;
        result.status = 'running';
        result.message = 'Creating new release...';
        const deployRes = await this.azureDevOps.deploy(buildId, env, svcName);
        if (!deployRes.success) {
          result.status = 'failed';
          result.message = deployRes.message;
          return;
        }
        result.releaseId = deployRes.releaseId;
        result.releaseUrl = deployRes.releaseUrl;
        result.releaseEnvironment = deployRes.releaseEnvironment;
        result.message = deployRes.message;
        this.addLog(`[${svcName}] Rerun: ${deployRes.message}`);
        if (deployRes.releaseId) {
          const waitRes = await this.azureDevOps.waitForDeployment(
            deployRes.releaseId,
            deployRes.releaseEnvironment || env,
            (s) => { result.message = s; }
          );
          result.status = waitRes.success ? 'success' : 'failed';
          result.message = waitRes.message;
          this.addLog(`[${svcName}] Rerun result: ${waitRes.message}`);
        } else {
          result.status = 'success';
        }
      }
      await this.persistStepsToHistory();
    } finally {
      result.rerunning = false;
    }
  }

  // ─── Step-level Refresh / Rerun ──────────────────────────────

  /** True for build (step 2) and deploy (steps 3 & 4) — these have Azure artifacts */
  isStepRefreshable(stepIndex: number): boolean {
    return stepIndex >= 2 && stepIndex <= 4;
  }

  /** Refresh all results in a step and recompute step status.
   *  If the step transitions to 'success' and the pipeline is idle, auto-continues. */
  async refreshStep(stepIndex: number): Promise<void> {
    if (this.stepRefreshing.has(stepIndex) || this.stepRerunning.has(stepIndex)) return;
    this.stepRefreshing.add(stepIndex);
    const step = this.steps[stepIndex];
    try {
      for (const result of step.results) {
        if (result.status === 'skipped') continue;
        if (result.buildId) {
          const res = await this.azureDevOps.checkBuildStatus(result.buildId);
          const label = res.result || res.status;
          if (res.done) {
            result.status = res.success ? 'success' : 'failed';
            result.message = `Build #${result.buildId} ${label}`;
          } else {
            result.message = `Build #${result.buildId} – ${label}`;
          }
        } else if (result.releaseId) {
          const env = result.releaseEnvironment || this.getActiveRunCtx().environment;
          const res = await this.azureDevOps.checkDeploymentStatus(result.releaseId, env);
          if (res.done) {
            result.status = res.success ? 'success' : 'failed';
            result.message = `Release #${result.releaseId}: deployment ${res.statusName}`;
          } else {
            result.message = `Release #${result.releaseId}: deployment ${res.statusName}...`;
          }
        }
      }
      const hasFailure = step.results.some((r) => r.status === 'failed');
      const allSkipped = step.results.every((r) => r.status === 'skipped');
      const prevStatus = step.status;
      step.status = hasFailure ? 'failed' : allSkipped ? 'skipped' : 'success';
      await this.persistStepsToHistory();

      // Auto-continue: if step is now success, there are more steps, and pipeline is idle
      if (step.status === 'success' && prevStatus !== 'success' && !this.isRunning) {
        const hasMoreSteps = this.steps.slice(stepIndex + 1).some((s) => s.status === 'pending' || s.status === 'running' || s.status === 'waiting-approval');
        if (hasMoreSteps) {
          this.addLog(`✓ Step refreshed to success — continuing pipeline from step ${stepIndex + 2}...`);
          await this.continueAfterStep(stepIndex);
        }
      }
    } finally {
      this.stepRefreshing.delete(stepIndex);
    }
  }

  /** Rerun all non-skipped results in a step, then auto-continue if successful */
  async rerunStep(stepIndex: number): Promise<void> {
    if (this.stepRefreshing.has(stepIndex) || this.stepRerunning.has(stepIndex)) return;
    this.stepRerunning.add(stepIndex);
    const step = this.steps[stepIndex];
    step.status = 'running';
    // Mark the run as 'running' while rerun is in progress
    const rerunRunId = this.currentRunId ?? this.viewingRun?.id;
    const rerunRecord = rerunRunId ? this.runHistory.find((r) => r.id === rerunRunId) : null;
    if (rerunRecord) rerunRecord.status = 'running';
    if (this.viewingRun) this.viewingRun = { ...this.viewingRun, status: 'running' };
    try {
      for (const result of step.results) {
        if (result.status === 'skipped') continue;
        await this.rerunResult(stepIndex, result);
      }
      const hasFailure = step.results.some((r) => r.status === 'failed');
      const allSkipped = step.results.every((r) => r.status === 'skipped');
      step.status = hasFailure ? 'failed' : allSkipped ? 'skipped' : 'success';
      // Recompute overall run status from all steps
      if (rerunRecord) {
        const anyFailed = this.steps.some(s => s.status === 'failed');
        const hasRemainingWork = this.steps.some(s => ['pending', 'running', 'waiting-approval'].includes(s.status));
        rerunRecord.status = anyFailed ? 'failed' : hasRemainingWork ? 'running' : 'success';
        if (this.viewingRun) this.viewingRun = { ...this.viewingRun, status: rerunRecord.status };
      }
      await this.persistStepsToHistory();

      // Auto-continue if step succeeded and there are remaining steps
      if (step.status === 'success' && !this.isRunning) {
        const hasMoreSteps = this.steps.slice(stepIndex + 1).some((s) => s.status === 'pending' || s.status === 'running' || s.status === 'waiting-approval');
        if (hasMoreSteps) {
          this.addLog(`✓ Step rerun succeeded — continuing pipeline from step ${stepIndex + 2}...`);
          await this.continueAfterStep(stepIndex);
        }
      }
    } finally {
      this.stepRerunning.delete(stepIndex);
    }
  }

  /** Resume the pipeline from after a given step index.
   *  Restores run context and calls resumePipeline() which skips completed steps. */
  private async continueAfterStep(stepIndex: number): Promise<void> {
    const runId = this.currentRunId ?? this.viewingRun?.id;
    const record = runId ? this.runHistory.find((r) => r.id === runId) : null;
    if (!record) {
      this.addLog('Cannot continue: run record not found in history.');
      return;
    }
    if (!this.isRunOwner(record)) {
      this.addLog('Cannot continue: only the run creator can resume execution.');
      return;
    }
    // Sync current steps into the record so resumePipeline sees the latest statuses
    record.steps = JSON.parse(JSON.stringify(this.steps));
    record.logs = [...this.logs];
    // Restore run context
    this.pipelineStarted = true;
    this.isRunning = true;
    this.currentRunId = record.id;
    this.releaseNumber = record.releaseNumber;
    this.releaseEnvironment = record.environment;
    this.selectedServices = new Set(record.services);
    this.viewingRun = null;
    await this.resumePipeline(record).catch((err) => {
      this.addLog(`Continue failed: ${err.message || err}`);
      this.isRunning = false;
      this.finalizeRunRecord('failed');
    });
  }

  /** Save current steps & logs to Firestore — works for both active and finished runs */
  private async persistStepsToHistory(): Promise<void> {
    const runId = this.currentRunId ?? this.viewingRun?.id;
    const record = runId ? this.runHistory.find((r) => r.id === runId) : null;
    if (!record) return;
    record.steps = JSON.parse(JSON.stringify(this.steps));
    record.logs = [...this.logs];
    await this.historyService.saveRun(record).catch((err: any) => {
      console.error('Failed to persist steps to Firestore:', err);
    });
    if (this.viewingRun?.id === record.id) {
      this.viewingRun = { ...this.viewingRun!, steps: record.steps, logs: record.logs };
    }
  }

  /** Navigate to a pipeline sub-tab (update URL without full navigation) */
  setSubTab(tab: 'run' | 'logs' | 'history'): void {
    this.pipelineSubTab = tab;
    this.location.replaceState('/pipeline/' + tab);
  }

  /** Try to open a run by ID from the URL (called when history loads or route changes) */
  private tryOpenPendingRun(): void {
    if (!this.pendingRunId || !this.runHistory.length) return;
    // Don't override an active running pipeline
    if (this.isRunning) return;
    const run = this.runHistory.find((r) => r.id === this.pendingRunId);
    if (run) {
      this.viewingRun = run;
      this.pipelineStarted = true;
      this.pipelineSubTab = 'run';
      this.steps = JSON.parse(JSON.stringify(run.steps));
      this.logs = [...(run.logs || [])];
      this.currentStepIndex = run.currentStepIndex ?? run.steps.length - 1;
      this.pendingRunId = null; // consumed
      // Track presence for concurrent viewer detection
      this.presenceService.joinRun(run.id);
    }
  }
}
