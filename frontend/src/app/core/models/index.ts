export interface AuthRequest {
  pat: string;
  provider: 'azure' | 'github';
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

export interface DevOpsConfig {
  azurePat: string;
  githubPat: string;
  organization: string;
  project: string;
  environments: string[];
}
