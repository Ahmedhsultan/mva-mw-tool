import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface RunViewer {
  uid: string;
  label: string;
  color: string;
  joinedAt: string;
  lastSeen: string;
}

/**
 * Run Presence Service — stub implementation.
 *
 * Real-time presence tracking requires a persistent connection (e.g. WebSocket
 * or Firestore listeners). Since we migrated away from Firebase, this service
 * keeps the same API surface but is a no-op. The UI will simply not show
 * concurrent viewers.
 */
@Injectable({ providedIn: 'root' })
export class RunPresenceService implements OnDestroy {
  /** Current viewers of the active run (always empty without real-time backend) */
  private viewersSubject = new BehaviorSubject<RunViewer[]>([]);
  viewers$: Observable<RunViewer[]> = this.viewersSubject.asObservable();

  /** Start tracking presence for a run (no-op) */
  async joinRun(_runId: string): Promise<void> {
    // No-op: real-time presence not available without Firebase
  }

  /** Stop tracking presence for the current run (no-op) */
  async leaveRun(): Promise<void> {
    this.viewersSubject.next([]);
  }

  ngOnDestroy(): void {
    this.leaveRun();
  }
}
