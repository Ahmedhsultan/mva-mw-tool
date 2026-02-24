import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  setDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { PipelineRunRecord } from '../models/release-pipeline.model';

@Injectable({ providedIn: 'root' })
export class PipelineHistoryService {
  private firestore = inject(Firestore);
  private collectionRef = collection(this.firestore, 'pipeline-runs');

  /** Stream all pipeline runs, newest first */
  getRuns$(): Observable<PipelineRunRecord[]> {
    // No orderBy/limit to avoid requiring a Firestore index
    return (collectionData(this.collectionRef, { idField: 'id' }) as Observable<PipelineRunRecord[]>).pipe(
      map((runs) => runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 50))
    );
  }

  /** Create or update a pipeline run record */
  async saveRun(record: PipelineRunRecord): Promise<void> {
    const docRef = doc(this.firestore, 'pipeline-runs', record.id);
    // Deep-clone to strip any class instances, proxies, or non-serializable refs
    const plain = JSON.parse(JSON.stringify(record));
    await setDoc(docRef, plain);
  }

  /** Delete a pipeline run record */
  async deleteRun(id: string): Promise<void> {
    const docRef = doc(this.firestore, 'pipeline-runs', id);
    await deleteDoc(docRef);
  }
}
