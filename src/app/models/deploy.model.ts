// ── Deploy Branch types ──────────────────────────────────────

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

export interface DeployTask {
  service: string;
  env: string;
  status: TaskStatus;
  message: string;
  releaseId?: number;
  releaseUrl?: string;
  phase?: DeployPhase;
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

// ── Shared helpers ──────────────────────────────────────────

/** Derive step status from a list of task statuses. Reusable for build, deploy, history, etc. */
export function deriveStepStatus(tasks: { status: TaskStatus }[]): TaskStatus {
  if (tasks.some((t) => t.status === 'running')) return 'running';
  if (tasks.some((t) => t.status === 'failed')) return 'failed';
  if (tasks.every((t) => t.status === 'success')) return 'success';
  return 'pending';
}

/** Sync a step's status based on its child tasks. */
export function syncStepStatus(steps: DeployStep[], stepId: string, tasks: { status: TaskStatus }[]): void {
  const step = steps.find((s) => s.id === stepId);
  if (step) step.status = deriveStepStatus(tasks);
}
