// ── Release Pipeline Model ───────────────────────────────────

/** Default microservice repository names in Azure DevOps (seed list; runtime list from SettingsService) */
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

/** Services that have a drop_db build, mapped to their branch name */
export const DROP_DB_BRANCHES: Record<string, string> = {
  'mvax-api': 'release/gouna/drop_db',
  'mvax-native-billing': 'release/dahab/drop_db',
  'mvax-plan-services': 'release/drop_db',
  'mvax-upgrades': 'release/dahab/drop_db',
};

import { ENVIRONMENTS } from './reservation.model';

/** Release environments — derived from the single source of truth in reservation.model */
export const RELEASE_ENVIRONMENTS = ENVIRONMENTS;
export type ReleaseEnvironment = (typeof ENVIRONMENTS)[number];

// ── Step & Result Types ──────────────────────────────────────

/** Status of each pipeline step per service */
export type StepStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'waiting-approval';

/** Result of a single service within a pipeline step */
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
  /** Build ID used as source for this deploy (for rerun) */
  sourceBuildId?: number;
  /** UI-only: row-level loading states */
  refreshing?: boolean;
  rerunning?: boolean;
}

/** Definition of a single step in the pipeline */
export interface PipelineStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  results: ServiceStepResult[];
}

// ── Pipeline State ───────────────────────────────────────────

/** The overall release pipeline state during a run */
export interface ReleasePipeline {
  releaseNumber: string;
  environment: string;
  services: string[];
  steps: PipelineStep[];
  startedAt?: Date;
  completedAt?: Date;
}

/** A persisted pipeline run record (stored in Firestore) */
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
  /** Firebase auth UID of the user who started the run */
  createdBy?: string;
}

// ── Azure DevOps Config ──────────────────────────────────────

/** Credentials and targeting for Azure DevOps API calls */
export interface AzureDevOpsConfig {
  organization: string;
  project: string;
  /** Personal Access Token */
  pat: string;
}
