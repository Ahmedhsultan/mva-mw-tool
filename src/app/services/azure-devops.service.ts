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

  /** Visual Studio Release Management base URL */
  private get vsrmBaseUrl(): string {
    if (!this.config) throw new Error('Azure DevOps not configured');
    return `https://vsrm.dev.azure.com/${this.config.organization}/${this.config.project}`;
  }

  /** Find a release environment stage by name (case-insensitive partial match) */
  private findEnvByName(environments: Record<string, any>[], name: string): Record<string, any> | undefined {
    return environments.find((e) => (e['name'] || '').toLowerCase().includes(name.toLowerCase()));
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
          if (result === 'succeeded' || result === 'partiallySucceeded') {
            return { success: true, message: `Build #${buildId} ${result}` };
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
   *
   * Strategy: create the release with ALL environments set to manual trigger,
   * then explicitly deploy only the target environment via the PATCH API.
   * This prevents Azure DevOps from auto-deploying to dev1 (or whichever
   * stage has an automatic trigger).
   */
  async deploy(
    buildId: number,
    environment: string,
    repo: string
  ): Promise<{ success: boolean; message: string; releaseId?: number; releaseUrl?: string; releaseEnvironment?: string }> {
    try {
      // Find release definition for this repo
      const defRes = await fetch(
        `${this.vsrmBaseUrl}/_apis/release/definitions?searchText=${repo}&$expand=environments,artifacts&api-version=7.1`,
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
      // Pick the definition whose name best matches the repo
      const repoLower = repo.toLowerCase();
      const releaseDef = defData.value.find((d: any) => (d.name || '').toLowerCase() === repoLower)
        || defData.value[0];

      // If the list endpoint didn't include full artifacts, fetch the definition directly
      let artifacts: any[] = releaseDef.artifacts || [];
      if (!artifacts.length) {
        const fullDefRes = await fetch(
          `${this.vsrmBaseUrl}/_apis/release/definitions/${releaseDef.id}?api-version=7.1`,
          { headers: this.headers }
        );
        if (fullDefRes.ok) {
          const fullDef = await this.safeJson(fullDefRes);
          artifacts = fullDef.artifacts || [];
        }
      }

      // Find the target environment stage
      const envStage = this.findEnvByName(releaseDef.environments || [], environment);
      if (!envStage) {
        return { success: false, message: `Environment "${environment}" not found in release definition for ${repo}` };
      }

      // Collect all environment names so we can set them ALL to manual trigger
      const allEnvNames: string[] = (releaseDef.environments || []).map((e: any) => e.name);

      // Create a release with ALL environments set to manual (no auto-deploy)
      const body: any = {
        definitionId: releaseDef.id,
        description: `Automated release for ${repo} to ${environment}`,
        isDraft: false,
        reason: 'manual',
        manualEnvironments: allEnvNames,
        artifacts: [],
      };

      // Override ONLY the artifact that corresponds to our repo/build.
      // Other artifacts (e.g. shared template repos) keep their default versions.
      if (artifacts.length) {
        // Try to match by alias or definition name containing the repo name
        let matched = artifacts.filter((a: any) => {
          if (a.type !== 'Build') return false;
          const alias = (a.alias || '').toLowerCase();
          const defName = (a.definitionReference?.definition?.name || '').toLowerCase();
          return alias.includes(repoLower) || alias === `_${repoLower}` || defName.includes(repoLower);
        });

        // Fallback: if no match by name, override ALL Build-type artifacts
        if (!matched.length) {
          matched = artifacts.filter((a: any) => a.type === 'Build');
        }

        if (matched.length) {
          body.artifacts = matched.map((a: any) => ({
            alias: a.alias,
            instanceReference: {
              id: String(buildId),
              name: null,
            },
          }));
        }
      }

      const releaseRes = await fetch(
        `${this.vsrmBaseUrl}/_apis/release/releases?api-version=7.1`,
        { method: 'POST', headers: this.headers, body: JSON.stringify(body) }
      );
      if (!releaseRes.ok) {
        const err = await releaseRes.text();
        return { success: false, message: `Failed to create release: ${releaseRes.status} – ${err}` };
      }
      const releaseData = await this.safeJson(releaseRes);

      // Find the target environment ID from the created release
      const targetEnv = this.findEnvByName(releaseData.environments || [], environment);
      if (!targetEnv) {
        return { success: false, message: `Target environment "${environment}" not found in created release #${releaseData.id}` };
      }

      // Trigger deployment on ONLY the target environment
      const deployRes = await fetch(
        `${this.vsrmBaseUrl}/_apis/release/releases/${releaseData.id}/environments/${(targetEnv as any).id}?api-version=7.1`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({
            status: 'inProgress',
            comment: `Triggered by MVA MW Tool for ${environment}`,
          }),
        }
      );
      if (!deployRes.ok) {
        const err = await deployRes.text();
        // Release was created but deploy trigger failed — still return the release info
        return {
          success: true,
          message: `Release #${releaseData.id} created but failed to trigger ${environment} deploy: ${err}`,
          releaseId: releaseData.id as number,
          releaseUrl: `https://dev.azure.com/${this.config!.organization}/${this.config!.project}/_releaseProgress?_a=release-environment-logs&releaseId=${releaseData.id}&definitionId=${releaseDef.id}`,
          releaseEnvironment: targetEnv['name'] || environment,
        };
      }

      const releaseUrl = `https://dev.azure.com/${this.config!.organization}/${this.config!.project}/_releaseProgress?_a=release-environment-logs&releaseId=${releaseData.id}&definitionId=${releaseDef.id}`;
      return {
        success: true,
        message: `Release #${releaseData.id} created → deploying to ${targetEnv['name']}`,
        releaseId: releaseData.id as number,
        releaseUrl,
        releaseEnvironment: targetEnv['name'] || environment,
      };
    } catch (e: any) {
      return { success: false, message: e.message || String(e) };
    }
  }

  // ─── Approval helpers ──────────────────────────────────────

  /**
   * Fetch pending pre-deployment approvals for a release.
   * Optionally filter by environment name.
   * If no filter match, returns ALL pending approvals for the release (to avoid missing them).
   */
  async getPendingApprovals(
    releaseId: number,
    environmentName?: string
  ): Promise<{ id: number; envName: string; approver: string; isGroup: boolean }[]> {
    try {
      const res = await fetch(
        `${this.vsrmBaseUrl}/_apis/release/approvals?releaseIdsFilter=${releaseId}&statusFilter=pending&api-version=7.1`,
        { headers: this.headers }
      );
      if (!res.ok) {
        console.warn('[Approvals] Failed to fetch:', res.status);
        return [];
      }
      const data = await this.safeJson(res);
      const approvals: any[] = data.value || [];

      // First try to match by environment name
      let filtered = approvals;
      if (environmentName) {
        const envMatch = approvals.filter((a: any) =>
          (a.releaseEnvironment?.name || '').toLowerCase().includes(environmentName.toLowerCase())
        );
        // If we found matches, use them; otherwise fall back to all pending
        if (envMatch.length > 0) {
          filtered = envMatch;
        }
      }

      return filtered.map((a: any) => ({
        id: a.id,
        envName: a.releaseEnvironment?.name || '',
        approver: a.approver?.displayName || a.approver?.uniqueName || 'unknown',
        isGroup: a.approver?.isContainer === true,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Approve a single pending approval by its ID.
   * For group-based approvals, the approvedBy is implicit (the PAT user).
   */
  async approveDeployment(approvalId: number, comments = 'Auto-approved by MVA MW Tool'): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(
        `${this.vsrmBaseUrl}/_apis/release/approvals/${approvalId}?api-version=7.1`,
        {
          method: 'PATCH',
          headers: this.headers,
          body: JSON.stringify({ status: 'approved', comments }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return { success: false, message: `Approval failed (${res.status}): ${err}` };
      }
      await this.safeJson(res);
      return { success: true, message: `Approval #${approvalId} approved` };
    } catch (e: any) {
      return { success: false, message: e.message || String(e) };
    }
  }

  /**
   * Approve all pending pre-deployment approvals for a release environment.
   */
  async approveAllForEnvironment(
    releaseId: number,
    environmentName: string,
    onProgress?: (msg: string) => void
  ): Promise<{ approved: number; failed: number; messages: string[] }> {
    const pending = await this.getPendingApprovals(releaseId, environmentName);
    const messages: string[] = [];
    let approved = 0;
    let failed = 0;
    if (pending.length === 0) {
      messages.push(`No pending approvals found for ${environmentName}`);
      return { approved, failed, messages };
    }
    for (const a of pending) {
      onProgress?.(`Approving deployment to ${a.envName} (approval #${a.id}, approver: ${a.approver})...`);
      const result = await this.approveDeployment(a.id);
      if (result.success) {
        approved++;
        messages.push(`✓ Approved deployment to ${a.envName}`);
      } else {
        failed++;
        messages.push(`✗ Failed to approve ${a.envName}: ${result.message}`);
      }
    }
    return { approved, failed, messages };
  }

  /** Poll a release environment until deployment completes or fails */
  async waitForDeployment(
    releaseId: number,
    environmentName: string,
    onProgress?: (status: string, phase?: string) => void
  ): Promise<{ success: boolean; message: string }> {
    const maxAttempts = 720; // 60 minutes at 5s intervals
    let approvalSucceeded = false;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(
          `${this.vsrmBaseUrl}/_apis/release/releases/${releaseId}?api-version=7.1`,
          { headers: this.headers }
        );
        if (!res.ok) {
          return { success: false, message: `Failed to check release: ${res.status}` };
        }
        const data = await this.safeJson(res);

        // Find the target environment/stage
        const env = this.findEnvByName(data.environments || [], environmentName);

        if (env) {
          const status: number = typeof env['status'] === 'number'
            ? env['status']
            : (RELEASE_STATUS_STRING_MAP[env['status']] ?? -1);
          const statusName = RELEASE_STATUS_NAMES[status] || `unknown(${status})`;

          if (status === 4) {
            onProgress?.(`Release #${releaseId} deployment succeeded`, 'succeeded');
            return { success: true, message: `Release #${releaseId} deployment ${statusName}` };
          }
          if (!RELEASE_IN_PROGRESS.has(status)) {
            onProgress?.(`Release #${releaseId} deployment ${statusName}`, statusName === 'rejected' ? 'rejected' : 'failed');
            return { success: false, message: `Release #${releaseId} deployment ${statusName}` };
          }

          // Auto-approve pending pre-deployment approvals while env is waiting
          if (!approvalSucceeded && (status === 1 || status === 128 || status === 0)) {
            const pending = await this.getPendingApprovals(releaseId, environmentName);
            if (pending.length > 0) {
              onProgress?.(`Release #${releaseId}: approving deployment to ${environmentName}...`, 'approving');
              const appResult = await this.approveAllForEnvironment(releaseId, environmentName, (m) => onProgress?.(m, 'approving'));
              appResult.messages.forEach((m) => onProgress?.(m, 'approving'));
              if (appResult.approved > 0 && appResult.failed === 0) {
                approvalSucceeded = true;
                onProgress?.(`Release #${releaseId}: approved — waiting for deployment to start...`, 'approved');
              }
              await this.delay(3000);
              continue;
            }
            // Approval not yet available
            onProgress?.(`Release #${releaseId}: waiting for approval gate on ${environmentName}...`, 'pending-approval');
          } else if (status === 2) {
            onProgress?.(`Release #${releaseId}: deployment in progress...`, 'deploying');
          } else if (status === 7) {
            onProgress?.(`Release #${releaseId}: deployment queued...`, 'queued');
          } else {
            onProgress?.(`Release #${releaseId}: deployment ${statusName}...`, statusName as any);
          }
        } else {
          onProgress?.(`Release #${releaseId}: waiting for environment...`, 'creating');
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
        return { done: true, success: data.result === 'succeeded' || data.result === 'partiallySucceeded', status: data.status, result: data.result };
      }
      return { done: false, success: false, status: data.status };
    } catch {
      return { done: false, success: false, status: 'error' };
    }
  }

  /** Single-poll: check deployment status without looping */
  async checkDeploymentStatus(releaseId: number, environmentName: string): Promise<{ done: boolean; success: boolean; statusName: string }> {
    try {
      const res = await fetch(
        `${this.vsrmBaseUrl}/_apis/release/releases/${releaseId}?api-version=7.1`,
        { headers: this.headers }
      );
      if (!res.ok) return { done: false, success: false, statusName: 'unknown' };
      const data = await this.safeJson(res);
      const env = this.findEnvByName(data.environments || [], environmentName);
      if (!env) return { done: false, success: false, statusName: 'waiting' };
      const envStatus: number = typeof env['status'] === 'number'
        ? env['status']
        : (RELEASE_STATUS_STRING_MAP[env['status']] ?? -1);
      if (envStatus === 4) return { done: true, success: true, statusName: 'succeeded' };
      if (!RELEASE_IN_PROGRESS.has(envStatus)) {
        return { done: true, success: false, statusName: RELEASE_STATUS_NAMES[envStatus] || `failed(${envStatus})` };
      }
      return { done: false, success: false, statusName: RELEASE_STATUS_NAMES[envStatus] || 'inProgress' };
    } catch {
      return { done: false, success: false, statusName: 'error' };
    }
  }

  /**
   * Find the latest successful build for a given repo + branch.
   * Returns the build ID, URL, and branch — or null if none found.
   */
  async getLatestBuild(
    repo: string,
    branch: string
  ): Promise<{ buildId: number; buildUrl: string; branch: string } | null> {
    try {
      const repoId = await this.getRepoId(repo);
      if (!repoId) return null;

      // Find ALL build definitions for this repo
      const defRes = await fetch(
        `${this.baseUrl}/_apis/build/definitions?repositoryId=${repoId}&repositoryType=TfsGit&api-version=7.1`,
        { headers: this.headers }
      );
      if (!defRes.ok) return null;
      const defData = await this.safeJson(defRes);
      if (!defData.value?.length) return null;

      // Search across ALL definitions (some repos have multiple pipelines)
      const branchRef = branch.startsWith('refs/heads/') ? branch : `refs/heads/${branch}`;
      const definitionIds = defData.value.map((d: any) => d.id).join(',');

      // Try succeeded first, then fall back to any completed build (partiallySucceeded, etc.)
      let url = `${this.baseUrl}/_apis/build/builds?definitions=${definitionIds}&branchName=${encodeURIComponent(branchRef)}&statusFilter=completed&resultFilter=succeeded&$top=1&api-version=7.1`;
      let res = await fetch(url, { headers: this.headers });
      let data = res.ok ? await this.safeJson(res) : { value: [] };

      if (!data.value?.length) {
        // Broaden search: any completed build (partiallySucceeded, failed, etc.)
        url = `${this.baseUrl}/_apis/build/builds?definitions=${definitionIds}&branchName=${encodeURIComponent(branchRef)}&statusFilter=completed&$top=1&api-version=7.1`;
        res = await fetch(url, { headers: this.headers });
        if (!res.ok) return null;
        data = await this.safeJson(res);
      }
      if (!data.value?.length) return null;

      const build = data.value[0];
      const buildUrl = build._links?.web?.href || `${this.baseUrl}/_build/results?buildId=${build.id}`;
      return { buildId: build.id, buildUrl, branch };
    } catch {
      return null;
    }
  }

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
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) return [];
      const data = await this.safeJson(res);

      interface RawIteration {
        name: string;
        path?: string;
        attributes?: { startDate?: string; finishDate?: string };
      }

      interface ParsedIteration {
        name: string;
        path: string;
        startDate: string;
        finishDate: string;
      }

      return (data.value || [] as RawIteration[])
        .map((it: RawIteration) => ({
          name: it.name,
          path: it.path || it.name,
          startDate: it.attributes?.startDate?.split('T')[0] || '',
          finishDate: it.attributes?.finishDate?.split('T')[0] || '',
        }))
        .filter((it: ParsedIteration) => it.startDate && it.finishDate)
        .sort((a: ParsedIteration, b: ParsedIteration) => a.startDate.localeCompare(b.startDate));
    } catch {
      return [];
    }
  }
}
