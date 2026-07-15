import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom, timeout } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { VoisResource } from './vois-resource.model';

const REQUEST_TIMEOUT_MS = 120000;

@Injectable({ providedIn: 'root' })
export class VoisResourceStoreService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private readonly resourcesSubject = new BehaviorSubject<VoisResource[]>([]);
  readonly resources$: Observable<VoisResource[]> = this.resourcesSubject.asObservable();

  async loadResources(): Promise<void> {
    const options = this.requestOptions();
    console.log('[ResourceStore] loadResources request:', {
      provider: options.params.get('provider'),
      repoId: options.params.get('repoId'),
      branch: options.params.get('branch'),
      organization: options.params.get('organization'),
      project: options.params.get('project'),
      hasPat: !!options.headers.get('X-PAT')
    });

    const resources = await firstValueFrom(
      this.http.get<VoisResource[]>('/api/resources', options).pipe(timeout(REQUEST_TIMEOUT_MS))
    );

    console.log('[ResourceStore] loadResources response:', resources?.length, 'resources');
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
    const config = this.authService.getConfig();
    const provider = config.resourcesProvider || 'azure';
    const settings = this.authService.getProviderSettings(provider);
    const repoId = (config.resourcesRepoId || '').trim();
    const branch = (config.resourcesBranch || 'main').trim() || 'main';

    if (!repoId) {
      throw new Error('Resources repository is not configured. Open Configuration and set the Resources Source repository.');
    }

    if (!settings.pat.trim()) {
      throw new Error(`Provider token is missing for ${provider === 'github' ? 'GitHub' : 'Azure DevOps'}. Open Configuration and set a PAT.`);
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