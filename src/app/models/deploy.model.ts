// ── Deploy Branch Model ──────────────────────────────────────

/** Status of a deploy-branch task or step */
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'warning';

/** A build/branch task result for a single service */
export interface ServiceTask {
  service: string;
  status: TaskStatus;
  message: string;
  buildId?: number;
  buildUrl?: string;
}

/** Aggregated task per environment (contains per-service deploy results) */
export interface EnvTask {
  env: string;
  status: TaskStatus;
  message: string;
  /** Per-service deployment results within this environment */
  deployments: DeployTask[];
}

// ── Deploy Phases ────────────────────────────────────────────

/** Granular phase of a single deployment */
export type DeployPhase =
  | 'creating'           // Creating release
  | 'pending-approval'   // Waiting for approval gate
  | 'approving'          // Auto-approving
  | 'approved'           // Approval done, waiting to start
  | 'queued'             // Queued for deployment
  | 'deploying'          // Deployment in progress
  | 'succeeded'          // Deployment succeeded
  | 'failed'             // Deployment failed
  | 'rejected';          // Approval rejected

/** A single service → environment deployment result */
export interface DeployTask {
  service: string;
  env: string;
  status: TaskStatus;
  message: string;
  releaseId?: number;
  releaseUrl?: string;
  phase?: DeployPhase;
}

// ── Steps & History ──────────────────────────────────────────

/** A high-level step in the deploy-branch workflow */
export interface DeployStep {
  id: string;
  label: string;
  description: string;
  status: TaskStatus;
}

/** A completed (or interrupted) deploy-branch run, stored in history */
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

// ── Shared Helpers ───────────────────────────────────────────

/** Derive an aggregate step status from a list of child task statuses */
export function deriveStepStatus(tasks: { status: TaskStatus }[]): TaskStatus {
  if (tasks.some((t) => t.status === 'running')) return 'running';
  if (tasks.some((t) => t.status === 'failed')) return 'failed';
  if (tasks.every((t) => t.status === 'success')) return 'success';
  return 'pending';
}

/** Update a step's status to match its child tasks */
export function syncStepStatus(
  steps: DeployStep[],
  stepId: string,
  tasks: { status: TaskStatus }[],
): void {
  const step = steps.find((s) => s.id === stepId);
  if (step) {
    step.status = deriveStepStatus(tasks);
  }
}
