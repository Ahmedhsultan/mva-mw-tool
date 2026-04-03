// ── Service barrel exports ───────────────────────────────────
// Import from '@services' or '../../services' instead of individual files.

export { AuthService, type AppUser } from './auth.service';
export { AzureDevOpsService } from './azure-devops.service';
export { DeployHistoryService, type SavedRunState } from './deploy-history.service';
export { JsonDbService, type JsonDbConfig } from './json-db.service';
export { PipelineHistoryService } from './pipeline-history.service';
export { ReservationService } from './reservation.service';
export { RunPresenceService, type RunViewer } from './run-presence.service';
export {
  SettingsService,
  type ServiceConfig,
  type ServiceType,
  type PipelineType,
  type EnvCategory,
  type PatConfig,
  type BuildCategoryId,
  type PipelineStepId,
  ALL_BUILD_CATEGORIES,
  BUILD_CATEGORY_LABELS,
  BUILD_CATEGORY_DESCRIPTIONS,
  ALL_PIPELINE_STEPS,
  PIPELINE_STEP_LABELS,
  PIPELINE_STEP_DESCRIPTIONS,
} from './settings.service';
