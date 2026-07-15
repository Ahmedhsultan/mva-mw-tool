import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, timeout } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { VoisResource } from './vois-resource.model';

const REQUEST_TIMEOUT_MS = 20000;

@Injectable({ providedIn: 'root' })
export class VoisResourceStoreService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private readonly resourcesSubject = new BehaviorSubject<VoisResource[]>([]);
  readonly resources$: Observable<VoisResource[]> = this.resourcesSubject.asObservable();

  async loadResources(): Promise<void> {
    const resources = await firstValueFrom(
      this.http.get<VoisResource[]>('/api/resources', this.requestOptions()).pipe(timeout(REQUEST_TIMEOUT_MS))
    );
    this.resourcesSubject.next(this.sortResources(resources ?? []));
  }

  async addResource(resource: Omit<VoisResource, 'id' | 'isCustom'>): Promise<void> {
    const created = await firstValueFrom(
      this.http.post<VoisResource>('/api/resources', resource, this.requestOptions()).pipe(timeout(REQUEST_TIMEOUT_MS))
    );
    const nextResources = [...this.resourcesSubject.value, this.normalize(created)];
    this.resourcesSubject.next(this.sortResources(nextResources));
  }

  async deleteResource(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`/api/resources/${encodeURIComponent(id)}`, this.requestOptions()).pipe(timeout(REQUEST_TIMEOUT_MS))
    );
    this.resourcesSubject.next(this.resourcesSubject.value.filter((resource) => resource.id !== id));
  }

  private requestOptions(): { headers: HttpHeaders; params: HttpParams } {
    const provider = this.authService.getTabProvider('config');
    const settings = this.authService.getProviderSettings(provider);
    const config = this.authService.getConfig();
    const repoId = config.dbRepoId.trim();
    const branch = config.dbBranch.trim() || 'main';

    if (!repoId) {
      throw new Error('Config repo is missing. Open Workspace settings and set the config repository first.');
    }

    if (!settings.pat.trim()) {
      throw new Error('Provider token is missing for the current config provider.');
    }

    const headers = new HttpHeaders({ 'X-PAT': settings.pat });
    const params = new HttpParams()
      .set('provider', provider)
      .set('organization', settings.organization)
      .set('project', settings.project)
      .set('repoId', repoId)
      .set('branch', branch);

    return { headers, params };
  }

  private sortResources(resources: VoisResource[]): VoisResource[] {
    return [...resources].map((resource) => this.normalize(resource)).sort(
      (left, right) => left.category.localeCompare(right.category) || left.label.localeCompare(right.label)
    );
  }

  private normalize(resource: VoisResource): VoisResource {
    return {
      ...resource,
      isCustom: Boolean(resource.isCustom)
    };
  }
}