import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PipelineRunRecord } from '../models/release-pipeline.model';

const LS_KEY = 'mva_pipeline_runs';
const MAX_RUNS = 50;

@Injectable({ providedIn: 'root' })
export class PipelineHistoryService {
  private runsSubject = new BehaviorSubject<PipelineRunRecord[]>(this.loadFromStorage());

  /** Stream all pipeline runs, newest first */
  getRuns$(): Observable<PipelineRunRecord[]> {
    return this.runsSubject.asObservable().pipe(
      map((runs) => runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_RUNS))
    );
  }

  /** Create or update a pipeline run record */
  async saveRun(record: PipelineRunRecord): Promise<void> {
    const runs = [...this.runsSubject.value];
    const idx = runs.findIndex((r) => r.id === record.id);
    const plain = structuredClone(record);
    if (idx >= 0) {
      runs[idx] = plain;
    } else {
      runs.unshift(plain);
    }
    // Cap at MAX_RUNS
    if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
    this.runsSubject.next(runs);
    this.saveToStorage(runs);
  }

  /** Delete a pipeline run record */
  async deleteRun(id: string): Promise<void> {
    const runs = this.runsSubject.value.filter((r) => r.id !== id);
    this.runsSubject.next(runs);
    this.saveToStorage(runs);
  }

  // ── Private helpers ────────────────────────────────────────

  private loadFromStorage(): PipelineRunRecord[] {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(runs: PipelineRunRecord[]): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(runs));
    } catch {
      // localStorage full — try to trim and retry
      try {
        const trimmed = runs.slice(0, Math.floor(MAX_RUNS / 2));
        localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
      } catch {
        // Give up silently
      }
    }
  }
}
