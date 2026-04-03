import { inject, Injectable, OnDestroy } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { BehaviorSubject, Observable } from 'rxjs';

export interface RunViewer {
  uid: string;
  label: string;
  color: string;
  joinedAt: string;
  lastSeen: string;
}

/** Stale threshold: viewers not seen in this many ms are considered gone */
const STALE_MS = 60_000; // 60 seconds

/** Heartbeat interval */
const HEARTBEAT_MS = 20_000; // 20 seconds

/** Palette for viewer avatars */
const COLORS = [
  '#E60000', '#FF6600', '#009900', '#0066CC',
  '#9933CC', '#CC3399', '#00AACC', '#FF3366',
  '#6B8E23', '#FF8C00', '#4682B4', '#8B008B',
];

@Injectable({ providedIn: 'root' })
export class RunPresenceService implements OnDestroy {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  /** Current viewers of the active run (excluding self) */
  private viewersSubject = new BehaviorSubject<RunViewer[]>([]);
  viewers$: Observable<RunViewer[]> = this.viewersSubject.asObservable();

  /** Internal state */
  private currentRunId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotUnsub: Unsubscribe | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /** Generate a short label from UID */
  private uidLabel(uid: string): string {
    return 'User ' + uid.substring(0, 4).toUpperCase();
  }

  /** Deterministic color from UID */
  private uidColor(uid: string): string {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
      hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  /** Start tracking presence for a run */
  async joinRun(runId: string): Promise<void> {
    // If already tracking a different run, leave it first
    if (this.currentRunId && this.currentRunId !== runId) {
      await this.leaveRun();
    }
    if (this.currentRunId === runId) return; // already joined

    this.currentRunId = runId;
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;

    // Write initial presence doc
    await this.writePresence(runId, uid, true);

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      if (this.currentRunId) {
        this.writePresence(this.currentRunId, uid);
      }
    }, HEARTBEAT_MS);

    // Listen to viewers subcollection
    const viewersCol = collection(this.firestore, 'pipeline-runs', runId, 'viewers');
    this.snapshotUnsub = onSnapshot(viewersCol, (snapshot) => {
      const now = Date.now();
      const viewers: RunViewer[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as RunViewer;
        // Skip self
        if (data.uid === uid) return;
        // Skip stale viewers
        const lastSeen = new Date(data.lastSeen).getTime();
        if (now - lastSeen > STALE_MS) return;
        viewers.push(data);
      });
      this.viewersSubject.next(viewers);
    });

    // Periodically re-evaluate staleness (in case no snapshot fires)
    this.cleanupTimer = setInterval(() => {
      const current = this.viewersSubject.value;
      const now = Date.now();
      const fresh = current.filter(
        (v) => now - new Date(v.lastSeen).getTime() <= STALE_MS
      );
      if (fresh.length !== current.length) {
        this.viewersSubject.next(fresh);
      }
    }, STALE_MS / 2);
  }

  /** Stop tracking presence for the current run */
  async leaveRun(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.snapshotUnsub) {
      this.snapshotUnsub();
      this.snapshotUnsub = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Remove presence doc
    const uid = this.auth.currentUser?.uid;
    if (this.currentRunId && uid) {
      try {
        const docRef = doc(
          this.firestore,
          'pipeline-runs',
          this.currentRunId,
          'viewers',
          uid
        );
        await deleteDoc(docRef);
      } catch {
        // Best effort — user might have already left
      }
    }

    this.currentRunId = null;
    this.viewersSubject.next([]);
  }

  /** Write/update the presence document. Only sets joinedAt on initial write. */
  private async writePresence(runId: string, uid: string, isInitial = false): Promise<void> {
    try {
      const docRef = doc(this.firestore, 'pipeline-runs', runId, 'viewers', uid);
      const now = new Date().toISOString();
      const viewer: Partial<RunViewer> = {
        uid,
        label: this.uidLabel(uid),
        color: this.uidColor(uid),
        lastSeen: now,
        ...(isInitial ? { joinedAt: now } : {}),
      };
      await setDoc(docRef, viewer, { merge: true });
    } catch {
      // Best effort — presence is non-critical
    }
  }

  ngOnDestroy(): void {
    this.leaveRun();
  }
}
