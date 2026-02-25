/** Microservice repositories in Azure DevOps */
export const MICROSERVICES = [
  'mvax-api',
  'mvax-native-billing',
  'mvax-offers',
  'mvax-upgrades',
  'mvax-authentication',
  'mvax-plan-services',
  'mvax-adobe-integrator',
  'mvax-account-dashboard',
  'mvax-common',
  'mvax-population-engine',
] as const;

export type Microservice = (typeof MICROSERVICES)[number];

/** Library services: different branch naming (primary/{release}), no deployment */
export const LIBRARY_SERVICES: ReadonlySet<string> = new Set([
  'mvax-common',
  'mvax-population-engine',
]);

/** Returns true if the service is a library (no deploy, different branch name) */
export function isLibraryService(svc: string): boolean {
  return LIBRARY_SERVICES.has(svc);
}

/** Services that have a drop_db build, mapped to their branch name */
export const DROP_DB_BRANCHES: Record<string, string> = {
  'mvax-api': 'release/gouna/drop_db',
  'mvax-native-billing': 'release/dahab/drop_db',
  'mvax-plan-services': 'release/drop_db',
  'mvax-upgrades': 'release/dahab/drop_db',
};

/** Returns the drop_db branch for a service, or null if the service has no drop_db build */
export function getDropDbBranch(svc: string): string | null {
  return DROP_DB_BRANCHES[svc] ?? null;
}

/** Get the release branch name for a service */
export function getReleaseBranch(svc: string, releaseNumber: string): string {
  return isLibraryService(svc)
    ? `primary/${releaseNumber}`
    : `release/primary/${releaseNumber}`;
}

/** Release environments (same as reservation environments) */
export const RELEASE_ENVIRONMENTS = [
  'dev1',
  'qcx',
  'qc1',
  'qc2',
  'qc5',
] as const;

export type ReleaseEnvironment = (typeof RELEASE_ENVIRONMENTS)[number];

/** Status of each pipeline step per service */
export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'waiting-approval';

/** Individual service step result */
export interface ServiceStepResult {
  service: string;
  status: StepStatus;
  message?: string;
  prUrl?: string;
  buildId?: number;
  buildUrl?: string;
  releaseId?: number;
  releaseUrl?: string;
  releaseEnvironment?: string;
  /** Build ID used as source for this deploy (used for rerun) */
  sourceBuildId?: number;
  /** UI-only flags for row-level loading */
  refreshing?: boolean;
  rerunning?: boolean;
}

/** Pipeline step definition */
export interface PipelineStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  results: ServiceStepResult[];
}

/** The overall release pipeline state */
export interface ReleasePipeline {
  releaseNumber: string;
  environment: string;
  services: string[];
  steps: PipelineStep[];
  startedAt?: Date;
  completedAt?: Date;
}

/** A saved pipeline run record */
export interface PipelineRunRecord {
  id: string;
  releaseNumber: string;
  environment: string;
  services: string[];
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt?: string;
  currentStepIndex: number;
  steps: PipelineStep[];
  logs: string[];
  createdBy?: string; // Firebase auth UID of the user who started the run
}

/** Azure DevOps config */
export interface AzureDevOpsConfig {
  organization: string;
  project: string;
  pat: string; // Personal Access Token
}
