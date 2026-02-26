import { Injectable } from '@angular/core';
import type {
  DeployHistoryEntry,
  DeployStep,
  ServiceTask,
  DeployTask,
  EnvTask,
  TaskStatus,
} from '../models/deploy.model';

const LS_HISTORY = 'db-run-history';
const LS_RUN_STATE = 'db-run-state';
const MAX_HISTORY = 20;

export interface SavedRunState {
  runId: string;
  branch: string;
  services: string[];
  environments: string[];
  startedAt: string;
  isRunning: boolean;
  isComplete: boolean;
  logs: string[];
  steps: DeployStep[];
  patResult: ServiceTask | null;
  branchTasks: ServiceTask[];
  buildTasks: ServiceTask[];
  deployTasks: DeployTask[];
  envReservationTasks: EnvTask[];
}

@Injectable({ providedIn: 'root' })
export class DeployHistoryService {
  // ── History (array of finished / interrupted runs) ────────

  loadHistory(): DeployHistoryEntry[] {
    try {
      const raw = localStorage.getItem(LS_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveHistory(history: DeployHistoryEntry[]): void {
    localStorage.setItem(LS_HISTORY, JSON.stringify(history));
  }

  clearHistory(): void {
    localStorage.removeItem(LS_HISTORY);
  }

  /** Push a new entry at position 0, cap at MAX_HISTORY entries. Returns the mutated array. */
  pushEntry(history: DeployHistoryEntry[], entry: DeployHistoryEntry): DeployHistoryEntry[] {
    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    this.saveHistory(history);
    return history;
  }

  // ── Active-run persistence ────────────────────────────────

  saveCurrentRun(state: SavedRunState): void {
    if (!state.runId) return;
    localStorage.setItem(LS_RUN_STATE, JSON.stringify(state));
  }

  loadCurrentRun(): SavedRunState | null {
    const raw = localStorage.getItem(LS_RUN_STATE);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem(LS_RUN_STATE);
      return null;
    }
  }

  clearCurrentRun(): void {
    localStorage.removeItem(LS_RUN_STATE);
  }

  // ── Build a history entry from the current run state ──────

  buildEntry(opts: {
    runId: string;
    branch: string;
    services: Set<string> | string[];
    environments: Set<string> | string[];
    startedAt: string;
    success: boolean | 'interrupted';
    logs: string[];
    steps: DeployStep[];
    patResult: ServiceTask | null;
    branchTasks: ServiceTask[];
    buildTasks: ServiceTask[];
    deployTasks: DeployTask[];
    envReservationTasks: EnvTask[];
  }): DeployHistoryEntry {
    const overallStatus: DeployHistoryEntry['overallStatus'] =
      opts.success === 'interrupted' ? 'interrupted' : opts.success ? 'success' : 'failed';
    return {
      id: opts.runId,
      branch: opts.branch,
      services: Array.from(opts.services),
      environments: Array.from(opts.environments),
      startedAt: opts.startedAt,
      finishedAt: new Date().toISOString(),
      overallStatus,
      logs: [...opts.logs],
      steps: [...opts.steps],
      patResult: opts.patResult,
      branchTasks: [...opts.branchTasks],
      buildTasks: [...opts.buildTasks],
      deployTasks: [...opts.deployTasks],
      envReservationTasks: [...opts.envReservationTasks],
    };
  }

  // ── Format helper ─────────────────────────────────────────

  formatDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }
}
