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
}

/** Azure DevOps config */
export interface AzureDevOpsConfig {
  organization: string;
  project: string;
  pat: string; // Personal Access Token
}
