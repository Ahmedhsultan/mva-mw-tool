import { inject, Injectable } from '@angular/core';
import { AzureDevOpsConfig } from '../models/release-pipeline.model';
import { SettingsService, PatConfig } from './settings.service';

// ── Shared Azure release status maps (single source of truth) ───────────────
const RELEASE_STATUS_STRING_MAP: Record<string, number> = {
  undefined: 0, notStarted: 1, inProgress: 2, partiallySucceeded: 3,
  succeeded: 4, rejected: 5, canceled: 6, queued: 7, scheduled: 64, pending: 128,
};
const RELEASE_STATUS_NAMES: Record<number, string> = {
  0: 'undefined', 1: 'notStarted', 2: 'inProgress',
  3: 'partiallySucceeded', 4: 'succeeded', 5: 'rejected',
  6: 'canceled', 7: 'queued', 8: 'rejected', 16: 'rejected',
  32: 'canceled', 64: 'scheduled', 128: 'pending',
};
/** Status codes considered in-progress (transient). */
const RELEASE_IN_PROGRESS = new Set([0, 1, 2, 7, 64, 128]);

@Injectable({ providedIn: 'root' })
export class AzureDevOpsService {
  private settingsService = inject(SettingsService);
  private config: AzureDevOpsConfig | null = null;

  constructor() {
    // Auto-configure when PAT config arrives from Firestore
    this.settingsService.patConfig$.subscribe((patConfig) => {
      if (patConfig) {
        this.config = patConfig;
      }
    });
  }

  private get headers(): HeadersInit {
    if (!this.config) throw new Error('Azure DevOps not configured');
    const encoded = btoa(`:${this.config.pat}`);
    return {
      'Content-Type': 'application/json',
      Authorization: `Basic ${encoded}`,
    };
  }

  private get baseUrl(): string {
    if (!this.config) throw new Error('Azure DevOps not configured');
    return `https://dev.azure.com/${this.config.organization}/${this.config.project}`;
  }

  /**
   * Safely parse a fetch Response as JSON.
   * Throws a descriptive error if the response is HTML (expired/invalid PAT redirect).
   */
  private async safeJson(res: Response): Promise<any> {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const preview = (await res.text()).slice(0, 120);
      throw new Error(
        preview.includes('<!DOCTYPE') || preview.includes('<html')
          ? 'Authentication failed — received HTML instead of JSON (PAT may be invalid or expired)'
          : `Unexpected content-type: ${ct}`
      );
    }
    return res.json();
  }

  /** Set PAT & org config */
  configure(config: AzureDevOpsConfig): void {
    this.config = config;
  }

  isConfigured(): boolean {
    return !!this.config?.pat;
  }

  /** Validate the configured PAT by calling a lightweight Azure DevOps API */
  async validatePat(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(
        `https://dev.azure.com/${this.config!.organization}/_apis/projects?$top=1&api-version=7.1`,
        { headers: this.headers, redirect: 'manual' }
      );

      // Redirects (302, 0 from opaque) indicate login page → invalid PAT
      if (res.type === 'opaqueredirect' || res.status === 302 || res.status === 301) {
        return { success: false, message: 'Authentication failed — PAT is invalid or expired (redirected to login)' };
      }
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: `Authentication failed (${res.status}) — PAT may be invalid or expired` };
      }
      if (!res.ok) {
        return { success: false, message: `Azure DevOps API returned ${res.status}` };
      }

      // Verify we got JSON, not an HTML page
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { success: false, message: 'Authentication failed — received non-JSON response (PAT may be invalid or expired)' };
      }

      const data = await this.safeJson(res);
      if (data.count === undefined && !data.value) {
        return { success: false, message: 'Unexpected API response — PAT may lack required permissions' };
      }

      return { success: true, message: 'PAT verified — Azure DevOps access confirmed' };
    } catch (e: any) {
      return { success: false, message: `Connection error: ${e.message}` };
    }
  }

  // ─── Step 1: Create branch ───────────────────────────────────
  /**
   * Create branch from release/develop (or develop for mvax-common).
   * @param branchName Full branch name, e.g. 'release/primary/24.3' or 'primary/24.3'
   */
  async createBranch(repo: string, releaseNumber: string, branchName?: string): Promise<{ success: boolean; message: string }> {
    const targetBranch = branchName || `release/primary/${releaseNumber}`;
    // Use develop as base ONLY for mvax-common, all others use release/develop
    const baseBranch = repo === 'mvax-common' ? 'develop' : 'release/develop';
    try {
      // 1. Get the ref for base branch
      const refsRes = await fetch(
        `${this.baseUrl}/_apis/git/repositories/${repo}/refs?filter=heads/${baseBranch}&api-version=7.1`,
        { headers: this.headers }
      );
      if (!refsRes.ok) {
        const err = await refsRes.text();
        return { success: false, message: `Failed to get ${baseBranch} ref: ${refsRes.status} – ${err}` };
      }
      const refsData = await this.safeJson(refsRes);
      if (!refsData.value?.length) {
        return { success: false, message: `Branch ${baseBranch} not found` };
      }
      const sourceObjectId = refsData.value[0].objectId;

      // 2. Create the new branch
      const newRefName = `refs/heads/${targetBranch}`;
      const body = [
        {
          name: newRefName,
          oldObjectId: '0000000000000000000000000000000000000000',
          newObjectId: sourceObjectId,
        },
      ];

      const createRes = await fetch(
        `${this.baseUrl}/_apis/git/repositories/${repo}/refs?api-version=7.1`,
        { method: 'POST', headers: this.headers, body: JSON.stringify(body) }
      );
      if (!createRes.ok) {
        const err = await createRes.text();
        return { success: false, message: `Failed to create branch: ${createRes.status} – ${err}` };
      }
      const createData = await this.safeJson(createRes);
      const result = createData.value?.[0];
      if (result?.success === false) {
        return { success: false, message: result.customMessage || 'Branch creation failed' };
      }
      return { success: true, message: `Branch ${targetBranch} created` };
    } catch (e: any) {
      return { success: false, message: e.message || String(e) };
    }
  }

  // ─── Step 2: Create Pull Request ────────────────────────────
  async createPullRequest(
    repo: string,
    releaseNumber: string,
    branchName?: string
  ): Promise<{ success: boolean; message: string; prUrl?: string; prId?: number }> {
    const sourceBranch = branchName || `release/primary/${releaseNumber}`;
    try {
      const body = {
        sourceRefName: `refs/heads/${sourceBranch}`,
        targetRefName: 'refs/heads/master',
        title: `Release ${releaseNumber} – ${repo}`,
        description: `Automated PR for release ${releaseNumber} from ${sourceBranch} to master.`,
      };

      const res = await fetch(
        `${this.baseUrl}/_apis/git/repositories/${repo}/pullrequests?api-version=7.1`,
        { method: 'POST', headers: this.headers, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const err = await res.text();
        return { success: false, message: `Failed to create PR: ${res.status} – ${err}` };
      }
      const data = await this.safeJson(res);
      const prUrl = `${this.baseUrl}/_git/${repo}/pullrequest/${data.pullRequestId}`;
      return { success: true, message: `PR #${data.pullRequestId} created`, prUrl, prId: data.pullRequestId };
    } catch (e: any) {
      return { success: false, message: e.message || String(e) };
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────
  /** Resolve a repository name to its GUID */
  private async getRepoId(repo: string): Promise<string | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/_apis/git/repositories/${repo}?api-version=7.1`,
        { headers: this.headers }
      );
      if (!res.ok) return null;
      const data = await this.safeJson(res);
      return data.id ?? null;
    } catch {
      return null;
    }
  }

  // ─── Step 3 & 4: Queue Build ────────────────────────────────
  /**
   * Queue a build for a given repo + branch.
   * We look up the build definition by repository GUID first.
   */
  async queueBuild(
    repo: string,
    branch: string
  ): Promise<{ success: boolean; message: string; buildId?: number; buildUrl?: string }> {
    try {
      // Resolve repo name → GUID
      const repoId = await this.getRepoId(repo);
      if (!repoId) {
        return { success: false, message: `Repository "${repo}" not found` };
      }

      // Find build definition for this repo
      const defRes = await fetch(
        `${this.baseUrl}/_apis/build/definitions?repositoryId=${repoId}&repositoryType=TfsGit&api-version=7.1`,
        { headers: this.headers }
      );
      if (!defRes.ok) {
        const err = await defRes.text();
        return { success: false, message: `Failed to find build definition: ${defRes.status} – ${err}` };
      }
      const defData = await this.safeJson(defRes);
      if (!defData.value?.length) {
        return { success: false, message: `No build definition found for ${repo}` };
      }
      const definitionId = defData.value[0].id;

      // Queue the build
      const body = {
        definition: { id: definitionId },
        sourceBranch: `refs/heads/${branch}`,
        reason: 'manual',
      };
      const buildRes = await fetch(
        `${this.baseUrl}/_apis/build/builds?api-version=7.1`,
        { method: 'POST', headers: this.headers, body: JSON.stringify(body) }
      );
      if (!buildRes.ok) {
        const err = await buildRes.text();
        return { success: false, message: `Failed to queue build: ${buildRes.status} – ${err}` };
      }
      const buildData = await this.safeJson(buildRes);
      const buildUrl = buildData._links?.web?.href || `${this.baseUrl}/_build/results?buildId=${buildData.id}`;
      return { success: true, message: `Build #${buildData.id} queued`, buildId: buildData.id, buildUrl };
    } catch (e: any) {
      return { success: false, message: e.message || String(e) };
    }
  }

  /** Poll build status until it completes */
  async waitForBuild(buildId: number, onProgress?: (status: string) => void): Promise<{ success: boolean; message: string }> {
    const maxAttempts = 720; // 60 minutes with 5s intervals
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(
          `${this.baseUrl}/_apis/build/builds/${buildId}?api-version=7.1`,
          { headers: this.headers }
        );
        if (!res.ok) {
          return { success: false, message: `Failed to check build: ${res.status}` };
        }
        const data = await this.safeJson(res);
        const status = data.status; // notStarted, inProgress, completed
        const result = data.result; // succeeded, failed, canceled

        if (status === 'completed') {
          if (result === 'succeeded') {
            return { success: true, message: `Build #${buildId} succeeded` };
          }
          return { success: false, message: `Build #${buildId} ${result}` };
        }

        onProgress?.(`Build #${buildId}: ${status}...`);
        await this.delay(5000);
      } catch (e: any) {
        return { success: false, message: e.message || String(e) };
      }
    }
    return { success: false, message: `Build #${buildId} timed out` };
  }

  // ─── Step 5 & 6: Deploy (Release) ──────────────────────────
  /**
   * Trigger a release / deployment.
   * Uses the Release Management API (vsrm.dev.azure.com).
   */
  async deploy(
    buildId: number,
    environment: string,
    repo: string
  ): Promise<{ success: boolean; message: string; releaseId?: number; releaseUrl?: string; releaseEnvironment?: string }> {
    try {
      // Find release definition for this repo
      const vsrmBase = `https://vsrm.dev.azure.com/${this.config!.organization}/${this.config!.project}`;
      const defRes = await fetch(
        `${vsrmBase}/_apis/release/definitions?searchText=${repo}&api-version=7.1`,
        { headers: this.headers }
      );
      if (!defRes.ok) {
        const err = await defRes.text();
        return { success: false, message: `Failed to find release definition: ${defRes.status} – ${err}` };
      }
      const defData = await this.safeJson(defRes);
      if (!defData.value?.length) {
        return { success: false, message: `No release definition found for ${repo}` };
      }
      const releaseDef = defData.value[0];

      // Find the environment stage
      const envStage = releaseDef.environments?.find(
        (e: any) => e.name.toLowerCase().includes(environment.toLowerCase())
      );

      // Create a release
      const body: any = {
        definitionId: releaseDef.id,
        description: `Automated release for ${repo} to ${environment}`,
        isDraft: false,
        reason: 'manual',
        artifacts: [],
      };

      // If we have artifact info from the build
      if (releaseDef.artifacts?.length) {
        body.artifacts = releaseDef.artifacts.map((a: any) => ({
          alias: a.alias,
          instanceReference: {
            id: String(buildId),
            name: null,
          },
        }));
      }

      const releaseRes = await fetch(
        `${vsrmBase}/_apis/release/releases?api-version=7.1`,
        { method: 'POST', headers: this.headers, body: JSON.stringify(body) }
      );
      if (!releaseRes.ok) {
        const err = await releaseRes.text();
        return { success: false, message: `Failed to create release: ${releaseRes.status} – ${err}` };
      }
      const releaseData = await this.safeJson(releaseRes);
      const releaseUrl = `https://dev.azure.com/${this.config!.organization}/${this.config!.project}/_releaseProgress?_a=release-environment-logs&releaseId=${releaseData.id}`;
      return {
        success: true,
        message: `Release #${releaseData.id} created for ${repo} → ${environment}`,
        releaseId: releaseData.id as number,
        releaseUrl,
        releaseEnvironment: envStage?.name || environment,
      };
    } catch (e: any) {
      return { success: false, message: e.message || String(e) };
    }
  }

  /** Poll a release environment until deployment completes or fails */
  async waitForDeployment(
    releaseId: number,
    environmentName: string,
    onProgress?: (status: string) => void
  ): Promise<{ success: boolean; message: string }> {
    const vsrmBase = `https://vsrm.dev.azure.com/${this.config!.organization}/${this.config!.project}`;
    const maxAttempts = 720; // 60 minutes at 5s intervals

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(
          `${vsrmBase}/_apis/release/releases/${releaseId}?api-version=7.1`,
          { headers: this.headers }
        );
        if (!res.ok) {
          return { success: false, message: `Failed to check release: ${res.status}` };
        }
        const data = await this.safeJson(res);

        // Find the target environment/stage
        const env = data.environments?.find(
          (e: any) => e.name.toLowerCase().includes(environmentName.toLowerCase())
        );

        if (env) {
          // Azure DevOps EnvironmentStatus codes:
          // 0=undefined, 1=notStarted, 2=inProgress, 4=succeeded,
          // 7=queued, 64=scheduled, 128=pending  ← transient, keep polling
          // 3=partiallySucceeded, 5=rejected, 6=canceled, 8=rejected ← terminal
          const status: number = typeof env.status === 'number'
            ? env.status
            : (RELEASE_STATUS_STRING_MAP[env.status] ?? -1);
          const statusName = RELEASE_STATUS_NAMES[status] || `unknown(${status})`;

          if (status === 4) {
            return { success: true, message: `Release #${releaseId} deployment ${statusName}` };
          }
          if (!RELEASE_IN_PROGRESS.has(status)) {
            return { success: false, message: `Release #${releaseId} deployment ${statusName}` };
          }

          onProgress?.(`Release #${releaseId}: deployment ${statusName}...`);
        } else {
          onProgress?.(`Release #${releaseId}: waiting for environment...`);
        }

        await this.delay(5000);
      } catch (e: any) {
        return { success: false, message: e.message || String(e) };
      }
    }
    return { success: false, message: `Release #${releaseId} deployment timed out` };
  }

  /** Single-poll: check build status without looping */
  async checkBuildStatus(buildId: number): Promise<{ done: boolean; success: boolean; status: string; result?: string }> {
    try {
      const res = await fetch(
        `${this.baseUrl}/_apis/build/builds/${buildId}?api-version=7.1`,
        { headers: this.headers }
      );
      if (!res.ok) return { done: false, success: false, status: 'unknown' };
      const data = await this.safeJson(res);
      if (data.status === 'completed') {
        return { done: true, success: data.result === 'succeeded', status: data.status, result: data.result };
      }
      return { done: false, success: false, status: data.status };
    } catch {
      return { done: false, success: false, status: 'error' };
    }
  }

  /** Single-poll: check deployment status without looping */
  async checkDeploymentStatus(releaseId: number, environmentName: string): Promise<{ done: boolean; success: boolean; statusName: string }> {
    try {
      const vsrmBase = `https://vsrm.dev.azure.com/${this.config!.organization}/${this.config!.project}`;
      const res = await fetch(
        `${vsrmBase}/_apis/release/releases/${releaseId}?api-version=7.1`,
        { headers: this.headers }
      );
      if (!res.ok) return { done: false, success: false, statusName: 'unknown' };
      const data = await this.safeJson(res);
      const env = data.environments?.find(
        (e: any) => e.name.toLowerCase().includes(environmentName.toLowerCase())
      );
      if (!env) return { done: false, success: false, statusName: 'waiting' };
      const envStatus: number = typeof env.status === 'number'
        ? env.status
        : (RELEASE_STATUS_STRING_MAP[env.status] ?? -1);
      if (envStatus === 4) return { done: true, success: true, statusName: 'succeeded' };
      if (!RELEASE_IN_PROGRESS.has(envStatus)) {
        return { done: true, success: false, statusName: RELEASE_STATUS_NAMES[envStatus] || `failed(${envStatus})` };
      }
      return { done: false, success: false, statusName: RELEASE_STATUS_NAMES[envStatus] || 'inProgress' };
    } catch {
      return { done: false, success: false, statusName: 'error' };
    }
  }

  /** Persist PAT config to Firestore via SettingsService */
  persistConfig(): void {
    if (this.config) {
      this.settingsService.savePatConfig({
        pat: this.config.pat,
        organization: this.config.organization,
        project: this.config.project,
      });
    }
  }

  /** Restore PAT config from SettingsService (loaded from Firestore) */
  restoreConfig(): boolean {
    const config = this.settingsService.patConfig;
    if (config) {
      this.config = config;
      return true;
    }
    return false;
  }

  // ─── Verification helpers (for resume after refresh) ──────────

  /** Check if a release branch already exists */
  async checkBranchExists(repo: string, releaseNumber: string, branchName?: string): Promise<{ exists: boolean; message: string }> {
    const targetBranch = branchName || `release/primary/${releaseNumber}`;
    try {
      const filter = `heads/${targetBranch}`;
      const res = await fetch(
        `${this.baseUrl}/_apis/git/repositories/${repo}/refs?filter=${encodeURIComponent(filter)}&api-version=7.1`,
        { headers: this.headers }
      );
      if (res.status === 401 || res.status === 403) {
        return { exists: false, message: `Authentication failed (${res.status}) — PAT may be invalid or expired` };
      }
      if (!res.ok) return { exists: false, message: `Failed to check branch: ${res.status}` };

      // Guard against HTML responses from expired/invalid PATs
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { exists: false, message: 'Authentication failed — received non-JSON response (PAT may be invalid or expired)' };
      }

      const data = await this.safeJson(res);
      if (data.value?.length) {
        return { exists: true, message: `Branch ${targetBranch} already exists` };
      }
      return { exists: false, message: `Branch ${targetBranch} not found` };
    } catch (e: any) {
      return { exists: false, message: e.message || String(e) };
    }
  }

  /** Find an existing PR from release branch → master */
  async findExistingPR(
    repo: string,
    releaseNumber: string,
    branchName?: string
  ): Promise<{ exists: boolean; message: string; prUrl?: string; prId?: number }> {
    const sourceBranch = branchName || `release/primary/${releaseNumber}`;
    try {
      const sourceRef = `refs/heads/${sourceBranch}`;
      const res = await fetch(
        `${this.baseUrl}/_apis/git/repositories/${repo}/pullrequests?searchCriteria.sourceRefName=${encodeURIComponent(sourceRef)}&searchCriteria.targetRefName=refs/heads/master&searchCriteria.status=all&api-version=7.1`,
        { headers: this.headers }
      );
      if (!res.ok) return { exists: false, message: `Failed to check PR: ${res.status}` };
      const data = await this.safeJson(res);
      if (data.value?.length) {
        const pr = data.value[0];
        const prUrl = `${this.baseUrl}/_git/${repo}/pullrequest/${pr.pullRequestId}`;
        return { exists: true, message: `PR #${pr.pullRequestId} already exists`, prUrl, prId: pr.pullRequestId };
      }
      return { exists: false, message: 'No existing PR found' };
    } catch (e: any) {
      return { exists: false, message: e.message || String(e) };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Iteration / Sprint helpers ──────────────────────────────

  /**
   * Fetch all iterations for the given team so we can map any date to its PI/Sprint.
   * Returns them sorted by startDate.
   */
  async getAllIterations(team = 'MVA-Nubia'): Promise<{ name: string; path: string; startDate: string; finishDate: string }[]> {
    if (!this.config) return [];
    try {
      const url = `${this.baseUrl}/${encodeURIComponent(team)}/_apis/work/teamsettings/iterations?api-version=7.1`;
      console.log('[Iterations] Fetching:', url);
      const res = await fetch(url, { headers: this.headers });
      console.log('[Iterations] Response status:', res.status);
      if (!res.ok) return [];
      const data = await this.safeJson(res);
      console.log('[Iterations] Raw count:', data.value?.length, 'First:', data.value?.[0]);
      return (data.value || []).map((it: any) => ({
        name: it.name,
        path: it.path || it.name,
        startDate: it.attributes?.startDate?.split('T')[0] || '',
        finishDate: it.attributes?.finishDate?.split('T')[0] || '',
      })).filter((it: any) => it.startDate && it.finishDate)
        .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));
    } catch (e) {
      console.error('[Iterations] Error:', e);
      return [];
    }
  }
}
