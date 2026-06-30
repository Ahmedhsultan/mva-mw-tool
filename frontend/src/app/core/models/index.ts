export type DevOpsProvider = 'azure' | 'github';

export interface ProviderSettings {
  pat: string;
  organization: string;
  project: string;
}

export type AppTabKey = 'overview' | 'builds' | 'deployments' | 'config';

export interface AppTabProviders {
  overview: DevOpsProvider;
  builds: DevOpsProvider;
  deployments: DevOpsProvider;
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

export interface ConfigDataFile {
  environments: string[];
  repositories: string[];
}

export interface ConfigDataRequest {
  repoId: string;
  branch: string;
  environments: string[];
  repositories: string[];
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
