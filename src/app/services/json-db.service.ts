import { Injectable } from '@angular/core';

/**
 * JSON DB Service — reads and writes JSON files in an Azure DevOps Git repository.
 *
 * Acts as a simple "database" backed by JSON files committed to a repo.
 * - READ:  GET the raw file via the Items API
 * - WRITE: Push a new commit via the Pushes API (handles both create & update)
 *
 * PAT config is read directly from localStorage to avoid circular dependencies
 * with SettingsService.
 */

export interface PatConfig {
  organization: string;
  project: string;
  pat: string;
}

/** Configuration for the JSON DB repo */
export interface JsonDbConfig {
  /** Azure DevOps repo name that holds the JSON files */
  repoName: string;
  /** Branch to read from / write to */
  branch: string;
}

/** Default config — adjust if your repo name or branch differs */
const DEFAULT_DB_CONFIG: JsonDbConfig = {
  repoName: 'mva-mw-tool',
  branch: 'main',
};

const PAT_STORAGE_KEY = 'mva_pat_config';

@Injectable({ providedIn: 'root' })
export class JsonDbService {
  private dbConfig: JsonDbConfig = { ...DEFAULT_DB_CONFIG };

  /** Override the default repo/branch config */
  configure(config: Partial<JsonDbConfig>): void {
    Object.assign(this.dbConfig, config);
  }

  // ── PAT helpers (read directly from localStorage) ─────────

  private getPatConfig(): PatConfig | null {
    try {
      const raw = localStorage.getItem(PAT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private get headers(): HeadersInit {
    const config = this.getPatConfig();
    if (!config) throw new Error('PAT not configured');
    return {
      'Content-Type': 'application/json',
      Authorization: `Basic ${btoa(':' + config.pat)}`,
    };
  }

  private get baseUrl(): string {
    const config = this.getPatConfig();
    if (!config) throw new Error('PAT not configured');
    return `https://dev.azure.com/${config.organization}/${config.project}`;
  }

  /** Check whether a PAT is available */
  isConfigured(): boolean {
    return !!this.getPatConfig()?.pat;
  }

  // ── Read a JSON file from the repo ─────────────────────────

  /**
   * Reads and parses a JSON file from the configured repo/branch.
   * Returns `null` if the file doesn't exist, the PAT is missing, or on error.
   */
  async readFile<T = any>(filePath: string): Promise<T | null> {
    if (!this.isConfigured()) return null;
    try {
      const url =
        `${this.baseUrl}/_apis/git/repositories/${this.dbConfig.repoName}/items` +
        `?path=${encodeURIComponent(filePath)}` +
        `&versionDescriptor.version=${encodeURIComponent(this.dbConfig.branch)}` +
        `&versionDescriptor.versionType=branch` +
        `&api-version=7.1`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return res.json();
      }
      // Some Azure DevOps versions return the raw text
      const text = await res.text();
      return JSON.parse(text) as T;
    } catch (err) {
      console.warn(`JsonDbService: failed to read ${filePath}:`, err);
      return null;
    }
  }

  // ── Write a JSON file to the repo ──────────────────────────

  /**
   * Writes (creates or updates) a JSON file in the configured repo/branch.
   * Uses the Azure DevOps Pushes API to commit the change.
   */
  async writeFile(filePath: string, data: any, comment?: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('PAT not configured — cannot write to repo');
    }

    const commitComment = comment || `Update ${filePath}`;
    const content = JSON.stringify(data, null, 2);

    // 1. Get the latest commit objectId for the branch
    const oldObjectId = await this.getLatestCommitId();

    // 2. Determine if the file already exists (add vs edit)
    const changeType = await this.fileExists(filePath) ? 'edit' : 'add';

    // 3. Push the commit
    const pushUrl = `${this.baseUrl}/_apis/git/repositories/${this.dbConfig.repoName}/pushes?api-version=7.1`;
    const body = {
      refUpdates: [
        {
          name: `refs/heads/${this.dbConfig.branch}`,
          oldObjectId,
        },
      ],
      commits: [
        {
          comment: commitComment,
          changes: [
            {
              changeType,
              item: { path: filePath },
              newContent: { content, contentType: 'rawtext' },
            },
          ],
        },
      ],
    };

    const res = await fetch(pushUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // If conflict (409), retry once with fresh objectId
      if (res.status === 409) {
        await this.retryWrite(filePath, data, commitComment);
        return;
      }
      throw new Error(`Failed to push to repo (${res.status}): ${errText.slice(0, 200)}`);
    }
  }

  // ── Private helpers ────────────────────────────────────────

  /** Get the latest commit objectId for the configured branch */
  private async getLatestCommitId(): Promise<string> {
    const refsUrl =
      `${this.baseUrl}/_apis/git/repositories/${this.dbConfig.repoName}/refs` +
      `?filter=heads/${encodeURIComponent(this.dbConfig.branch)}` +
      `&api-version=7.1`;
    const res = await fetch(refsUrl, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to get branch ref (${res.status})`);
    const data = await res.json();
    const ref = data.value?.[0];
    if (!ref) throw new Error(`Branch "${this.dbConfig.branch}" not found in repo "${this.dbConfig.repoName}"`);
    return ref.objectId;
  }

  /** Check if a file exists in the repo */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const url =
        `${this.baseUrl}/_apis/git/repositories/${this.dbConfig.repoName}/items` +
        `?path=${encodeURIComponent(filePath)}` +
        `&versionDescriptor.version=${encodeURIComponent(this.dbConfig.branch)}` +
        `&versionDescriptor.versionType=branch` +
        `&api-version=7.1`;
      const res = await fetch(url, { method: 'HEAD', headers: this.headers });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Retry a write with a fresh objectId (handles 409 conflict) */
  private async retryWrite(filePath: string, data: any, comment: string): Promise<void> {
    const oldObjectId = await this.getLatestCommitId();
    const content = JSON.stringify(data, null, 2);
    const changeType = await this.fileExists(filePath) ? 'edit' : 'add';

    const pushUrl = `${this.baseUrl}/_apis/git/repositories/${this.dbConfig.repoName}/pushes?api-version=7.1`;
    const body = {
      refUpdates: [{ name: `refs/heads/${this.dbConfig.branch}`, oldObjectId }],
      commits: [{
        comment,
        changes: [{ changeType, item: { path: filePath }, newContent: { content, contentType: 'rawtext' } }],
      }],
    };

    const res = await fetch(pushUrl, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Failed to push to repo after retry (${res.status}): ${errText.slice(0, 200)}`);
    }
  }
}
