import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import {
  BuildDto,
  ConfigDataFile,
  ConfigDataRequest,
  DeployDto,
  RepoFileDto,
  CreateBuildRequest,
  CreateDeployRequest,
  PipelineDto,
  PipelinePayload,
  PipelineRunCredentials,
  PipelineRunDto,
  PushFileRequest
} from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {

  constructor(private http: HttpClient, private authService: AuthService) {}

  // ---- Builds ----

  getBuildById(provider: string, buildId: string): Observable<BuildDto> {
    const params = this.baseParams(provider);
    return this.http.get<BuildDto>(`/api/builds/${buildId}`, {
      headers: this.authHeaders(provider),
      params
    });
  }

  getBuildsByBranchAndRepo(provider: string, branch: string, repoId: string): Observable<BuildDto[]> {
    let params = this.baseParams(provider);
    params = params.set('branch', branch).set('repoId', repoId);
    return this.http.get<BuildDto[]>('/api/builds', {
      headers: this.authHeaders(provider),
      params
    });
  }

  createBuild(provider: string, request: CreateBuildRequest): Observable<BuildDto> {
    return this.http.post<BuildDto>('/api/builds', request, {
      headers: this.authHeaders(provider),
      params: this.baseParams(provider)
    });
  }

  // ---- Deploys ----

  getDeployById(provider: string, deployId: string): Observable<DeployDto> {
    return this.http.get<DeployDto>(`/api/deploys/${deployId}`, {
      headers: this.authHeaders(provider),
      params: this.baseParams(provider)
    });
  }

  createDeploy(provider: string, request: CreateDeployRequest): Observable<DeployDto> {
    return this.http.post<DeployDto>('/api/deploys', request, {
      headers: this.authHeaders(provider),
      params: this.baseParams(provider)
    });
  }

  listDefinitionEnvironments(provider: string, definitionId: string, connectorId?: string): Observable<string[]> {
    let headers = this.authHeaders(provider);
    let params = this.baseParams(provider);

    if (connectorId) {
      const connector = this.authService.getConnector(connectorId);
      if (connector) {
        headers = new HttpHeaders({ 'X-PAT': connector.pat });
        params = new HttpParams()
          .set('provider', provider)
          .set('organization', connector.organization || '')
          .set('project', connector.project || '');
      }
    }

    return this.http.get<string[]>(`/api/deploys/definitions/${encodeURIComponent(definitionId)}/environments`, {
      headers,
      params
    });
  }

  // ---- Config ----

  getConfigData(provider: string, repoId?: string, branch?: string): Observable<ConfigDataFile> {
    let params = this.configBaseParams(provider);

    if (repoId?.trim()) {
      params = params.set('repoId', repoId.trim());
    }

    if (branch?.trim()) {
      params = params.set('branch', branch.trim());
    }

    return this.http.get<ConfigDataFile>('/api/config', {
      headers: this.configAuthHeaders(provider),
      params
    });
  }

  saveConfigData(provider: string, request: ConfigDataRequest): Observable<void> {
    return this.http.put<void>('/api/config', request, {
      headers: this.configAuthHeaders(provider),
      params: this.configBaseParams(provider)
    });
  }

  private configAuthHeaders(provider: string): HttpHeaders {
    const settings = this.authService.getProviderConfigSettings(provider as 'azure' | 'github');
    return new HttpHeaders({ 'X-PAT': settings.pat });
  }

  private configBaseParams(provider: string): HttpParams {
    const settings = this.authService.getProviderConfigSettings(provider as 'azure' | 'github');
    return new HttpParams()
      .set('provider', provider)
      .set('organization', settings.organization)
      .set('project', settings.project);
  }

  // ---- Repo ----

  pullFile(provider: string, repoId: string, filePath: string, branch: string): Observable<RepoFileDto> {
    let params = this.baseParams(provider);
    params = params.set('repoId', repoId).set('filePath', filePath).set('branch', branch);
    return this.http.get<RepoFileDto>('/api/repo/file', {
      headers: this.authHeaders(provider),
      params
    });
  }

  pushFile(provider: string, request: PushFileRequest): Observable<void> {
    return this.http.post<void>('/api/repo/file', request, {
      headers: this.authHeaders(provider),
      params: this.baseParams(provider)
    });
  }

  // ---- Pipelines ----

  getPipelines(provider: string, repoId: string, branch: string): Observable<PipelineDto[]> {
    const params = this.configBaseParams(provider)
      .set('repoId', repoId)
      .set('branch', branch);

    return this.http.get<PipelineDto[]>('/api/pipelines', {
      headers: this.configAuthHeaders(provider),
      params
    });
  }

  createPipeline(provider: string, repoId: string, branch: string, pipelineName: string, payload: PipelinePayload): Observable<boolean> {
    const params = this.configBaseParams(provider)
      .set('repoId', repoId)
      .set('branch', branch)
      .set('pipelineName', pipelineName);

    return this.http.post<boolean>('/api/pipelines', payload, {
      headers: this.configAuthHeaders(provider),
      params
    });
  }

  deletePipeline(provider: string, repoId: string, branch: string, pipelineName: string): Observable<boolean> {
    const params = this.configBaseParams(provider)
      .set('repoId', repoId)
      .set('branch', branch);

    return this.http.delete<boolean>(`/api/pipelines/${encodeURIComponent(pipelineName)}`, {
      headers: this.configAuthHeaders(provider),
      params
    });
  }

  getPipelineRuns(): Observable<PipelineRunDto[]> {
    return this.http.get<PipelineRunDto[]>('/api/pipelines/runs');
  }

  runPipeline(provider: string, repoId: string, branch: string, pipelineName: string, credentials: PipelineRunCredentials): Observable<boolean> {
    const params = this.configBaseParams(provider)
      .set('repoId', repoId)
      .set('branch', branch);

    return this.http.post<boolean>(`/api/pipelines/${encodeURIComponent(pipelineName)}/run`, credentials, {
      headers: this.configAuthHeaders(provider),
      params
    });
  }

  getPipelineTaskStatus(pipelineRunName: string, taskId: string): Observable<string> {
    return this.http.get(`/api/pipelines/runs/${encodeURIComponent(pipelineRunName)}/tasks/${encodeURIComponent(taskId)}/status`, {
      responseType: 'text'
    });
  }

  stopPipelineRun(pipelineRunName: string): Observable<void> {
    return this.http.post<void>(`/api/pipelines/runs/${encodeURIComponent(pipelineRunName)}/stop`, {});
  }

  rerunTask(pipelineRunName: string, taskId: string): Observable<void> {
    return this.http.post<void>(`/api/pipelines/runs/${encodeURIComponent(pipelineRunName)}/tasks/${encodeURIComponent(taskId)}/rerun`, {});
  }

  stopTask(pipelineRunName: string, taskId: string): Observable<void> {
    return this.http.post<void>(`/api/pipelines/runs/${encodeURIComponent(pipelineRunName)}/tasks/${encodeURIComponent(taskId)}/stop`, {});
  }

  // ---- Helpers ----

  private authHeaders(provider: string): HttpHeaders {
    const settings = this.authService.getProviderSettings(provider as 'azure' | 'github');
    const pat = settings.pat;
    return new HttpHeaders({ 'X-PAT': pat });
  }

  private baseParams(provider: string): HttpParams {
    const settings = this.authService.getProviderSettings(provider as 'azure' | 'github');
    return new HttpParams()
      .set('provider', provider)
      .set('organization', settings.organization)
      .set('project', settings.project);
  }
}
