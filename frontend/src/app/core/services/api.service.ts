import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import {
  BuildDto,
  DeployDto,
  RepoFileDto,
  CreateBuildRequest,
  CreateDeployRequest,
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

  // ---- Helpers ----

  private authHeaders(provider: string): HttpHeaders {
    const config = this.authService.getConfig();
    const pat = provider === 'github' ? config.githubPat : config.azurePat;
    return new HttpHeaders({ 'X-PAT': pat });
  }

  private baseParams(provider: string): HttpParams {
    const config = this.authService.getConfig();
    return new HttpParams()
      .set('provider', provider)
      .set('organization', config.organization)
      .set('project', config.project);
  }
}
