export type DevOpsProvider = 'azure' | 'github';

export interface ProviderSettings {
  pat: string;
  organization: string;
  project: string;
}

export type AppTabKey = 'config';

export interface AppTabProviders {
  config: DevOpsProvider;
}

export interface AuthRequest {
  pat: string;
  provider: DevOpsProvider;
  organization: string;
  project: string;
}

export interface AuthResponse {
  valid: boolean;
  displayName: string;
  email: string;
  avatarUrl: string;
}

export interface BuildDto {
  id: string;
  buildNumber: string;
  status: string;
  result: string;
  sourceBranch: string;
  definitionName: string;
  definitionId: string;
  url: string;
}

export interface DeployDto {
  id: string;
  name: string;
  status: string;
  environment: string;
  artifacts: string[];
}

export interface RepoFileDto {
  path: string;
  content: string;
  commitId: string;
}

export interface CreateBuildRequest {
  branch: string;
  repoId: string;
  definitionId: string;
}

export interface CreateDeployRequest {
  buildId: string;
  definitionId: string;
  environment: string;
  description?: string;
}

export interface PushFileRequest {
  repoId: string;
  filePath: string;
  branch: string;
  content: string;
  commitMessage: string;
}

export type RepoProfileType = 'service' | 'library';

export interface RepoProfile {
  name: string;
  type: RepoProfileType;
  buildDefinitionId: string;
  deploymentDefinitionId: string;
}

export interface ConfigDataFile {
  environments: string[];
  repoProfiles: RepoProfile[];
}

export interface ConfigDataRequest {
  repoId: string;
  branch: string;
  environments: string[];
  repoProfiles: RepoProfile[];
}

export type GitAction = 'PUSH_FILE' | 'CREATE_BRANCH';

export type PipelineTaskType = 'BuildTask' | 'DeploymentTask' | 'ApprovalTask' | 'GitTask' | 'PrTask';

export type PipelineTaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'WAITING_APPROVAL'
  | 'SKIPPED'
  | 'RETRYING';

export interface PipelineCondition {
  taskId: string;
  status: PipelineTaskStatus;
}

export interface PipelineTaskNode {
  id: string;
  taskType: PipelineTaskType;
  devOpsServiceFactory: DevOpsProvider;
  conditions: PipelineCondition[];
  nextTaskIds: string[];
  branch?: string;
  repoName?: string;
  definitionId?: string;
  buildTaskId?: string;
  environment?: string;
  description?: string;
  approved?: boolean;
  fromBranch?: string;
  targetBranch?: string;
  sourceBranch?: string;
  gitAction?: GitAction;
  filePath?: string;
  content?: string;
  commitMessage?: string;
}

export interface PipelinePayload {
  tasks: PipelineTaskNode[];
}

export interface PipelineDto {
  pipelineName: string;
  pipelineStructure: PipelinePayload;
}

export interface ProviderCredentials {
  pat: string;
  organization: string;
  project: string;
}

export interface PipelineRunCredentials {
  azure?: ProviderCredentials;
  github?: ProviderCredentials;
}

export interface PipelineRunTask {
  id: string;
  taskType: PipelineTaskType;
  nextTaskIds: string[];
  status?: PipelineTaskStatus;
  failureMessage?: string;
  buildLink?: string;
  deploymentLink?: string;
  prLink?: string;
  branch?: string;
  repoName?: string;
  definitionId?: string;
  environment?: string;
  description?: string;
}

export interface PipelineRunDto {
  taskMap?: Record<string, PipelineRunTask>;
  rootTasks?: PipelineRunTask[];
  pipelineRunName: string;
  pipelineStructure: PipelinePayload;
}

export interface DevOpsConfig {
  provider: DevOpsProvider;
  azurePat: string;
  githubPat: string;
  azureOrganization: string;
  azureProject: string;
  githubOrganization: string;
  githubProject: string;
  organization: string;
  project: string;
  environments: string[];
  dbRepoId: string;
  dbBranch: string;
  tabProviders: AppTabProviders;
}
