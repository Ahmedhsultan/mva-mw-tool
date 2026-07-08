import { LowerCasePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription, interval } from 'rxjs';
import { switchMap, finalize } from 'rxjs/operators';
import { PipelineRunDto, PipelineRunTask, PipelineTaskStatus } from '../../../core/models';
import { ApiService } from '../../../core/services/api.service';

interface RunNodeLayout {
  task: PipelineRunTask;
  x: number;
  y: number;
}

interface RunEdge {
  key: string;
  path: string;
}

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;
const H_GAP = 100;
const V_GAP = 40;

@Component({
  selector: 'app-pipeline-run-viewer',
  standalone: true,
  imports: [LowerCasePipe, MatButtonModule, MatIconModule, MatSnackBarModule, MatTooltipModule],
  templateUrl: './pipeline-run-viewer.component.html',
  styleUrl: './pipeline-run-viewer.component.scss'
})
export class PipelineRunViewerComponent implements OnChanges, OnDestroy {
  @Input() run: PipelineRunDto | null = null;
  @Output() closed = new EventEmitter<void>();

  nodes: RunNodeLayout[] = [];
  edges: RunEdge[] = [];
  canvasWidth = 0;
  canvasHeight = 0;

  private pollSub?: Subscription;

  constructor(private apiService: ApiService, private snackBar: MatSnackBar) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['run']) {
      this.stopPolling();
      if (this.run) {
        this.buildGraph();
        this.startPolling();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  close(): void {
    this.stopPolling();
    this.closed.emit();
  }

  copyAllLinks(): void {
    const links = this.collectLinks();
    if (!links.length) {
      this.snackBar.open('No links available yet.', '', { duration: 2000, panelClass: 'error-snackbar' });
      return;
    }
    navigator.clipboard.writeText(links.join('\n')).then(() => {
      this.snackBar.open(`${links.length} link(s) copied.`, '', { duration: 2000, panelClass: 'success-snackbar' });
    });
  }

  taskLink(task: PipelineRunTask): string | undefined {
    return task.buildLink || task.deploymentLink || task.prLink;
  }

  openLink(link: string): void {
    window.open(link, '_blank', 'noopener');
  }

  statusIcon(status?: PipelineTaskStatus): string {
    switch (status) {
      case 'SUCCEEDED': return 'check_circle';
      case 'FAILED': return 'cancel';
      case 'RUNNING': return 'autorenew';
      case 'CANCELLED': return 'block';
      case 'WAITING_APPROVAL': return 'hourglass_top';
      case 'SKIPPED': return 'skip_next';
      case 'RETRYING': return 'replay';
      default: return 'schedule';
    }
  }

  statusTone(status?: PipelineTaskStatus): string {
    switch (status) {
      case 'SUCCEEDED': return 'is-success';
      case 'FAILED': case 'CANCELLED': return 'is-danger';
      case 'RUNNING': case 'RETRYING': return 'is-running';
      case 'WAITING_APPROVAL': return 'is-waiting';
      default: return 'is-neutral';
    }
  }

  readableType(type: string): string {
    return type.replace(/Task$/i, '');
  }

  overallStatus(): PipelineTaskStatus {
    const tasks = Object.values(this.run?.taskMap || {});
    if (!tasks.length) return 'PENDING';
    const statuses = tasks.map(t => t.status || 'PENDING');
    if (statuses.includes('FAILED')) return 'FAILED';
    if (statuses.includes('RUNNING')) return 'RUNNING';
    if (statuses.includes('WAITING_APPROVAL')) return 'WAITING_APPROVAL';
    if (statuses.every(s => s === 'SUCCEEDED')) return 'SUCCEEDED';
    if (statuses.includes('CANCELLED')) return 'CANCELLED';
    return 'PENDING';
  }

  isTerminal(): boolean {
    const s = this.overallStatus();
    return s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED';
  }

  // ---- private ----

  private buildGraph(): void {
    const taskMap = this.run?.taskMap;
    if (!taskMap) { this.nodes = []; this.edges = []; return; }

    const tasks = Object.values(taskMap);
    const levels = this.computeLevels(tasks, taskMap);
    const rows = new Map<number, number>();
    const posMap = new Map<string, { x: number; y: number }>();

    this.nodes = tasks.map(task => {
      const level = levels.get(task.id) || 0;
      const row = rows.get(level) || 0;
      rows.set(level, row + 1);

      const x = 40 + level * (NODE_WIDTH + H_GAP);
      const y = 40 + row * (NODE_HEIGHT + V_GAP);
      posMap.set(task.id, { x, y });

      return { task, x, y };
    });

    this.edges = [];
    for (const task of tasks) {
      const src = posMap.get(task.id);
      if (!src) continue;
      for (const nextId of task.nextTaskIds || []) {
        const tgt = posMap.get(nextId);
        if (!tgt) continue;
        const sx = src.x + NODE_WIDTH;
        const sy = src.y + NODE_HEIGHT / 2;
        const tx = tgt.x;
        const ty = tgt.y + NODE_HEIGHT / 2;
        const mx = (sx + tx) / 2;
        this.edges.push({
          key: `${task.id}-${nextId}`,
          path: `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`
        });
      }
    }

    const maxLevel = Math.max(...[...levels.values()], 0);
    const maxRows = Math.max(...[...rows.values()], 1);
    this.canvasWidth = 80 + (maxLevel + 1) * (NODE_WIDTH + H_GAP);
    this.canvasHeight = 80 + maxRows * (NODE_HEIGHT + V_GAP);
  }

  private computeLevels(tasks: PipelineRunTask[], taskMap: Record<string, PipelineRunTask>): Map<string, number> {
    const levels = new Map<string, number>();
    const inDeg = new Map<string, number>();

    for (const t of tasks) {
      inDeg.set(t.id, 0);
    }
    for (const t of tasks) {
      for (const nid of t.nextTaskIds || []) {
        inDeg.set(nid, (inDeg.get(nid) || 0) + 1);
      }
    }

    const queue = tasks.filter(t => (inDeg.get(t.id) || 0) === 0);
    for (const t of queue) levels.set(t.id, 0);

    let i = 0;
    while (i < queue.length) {
      const current = queue[i++];
      const lvl = levels.get(current.id) || 0;
      for (const nid of current.nextTaskIds || []) {
        const next = taskMap[nid];
        if (!next) continue;
        const newLvl = lvl + 1;
        if ((levels.get(nid) || 0) < newLvl) levels.set(nid, newLvl);
        inDeg.set(nid, (inDeg.get(nid) || 0) - 1);
        if (inDeg.get(nid) === 0) queue.push(next);
      }
    }

    return levels;
  }

  private collectLinks(): string[] {
    return Object.values(this.run?.taskMap || {})
      .map(t => this.taskLink(t))
      .filter((link): link is string => !!link);
  }

  private startPolling(): void {
    if (!this.run || this.isTerminal()) return;

    this.pollSub = interval(5000).pipe(
      switchMap(() => this.apiService.getPipelineRuns())
    ).subscribe(runs => {
      const updated = runs.find(r => r.pipelineRunName === this.run?.pipelineRunName);
      if (updated) {
        this.run = updated;
        this.buildGraph();
        if (this.isTerminal()) {
          this.stopPolling();
        }
      }
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
  }
}
