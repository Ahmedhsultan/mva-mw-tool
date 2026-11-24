import { LowerCasePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription, interval, EMPTY } from 'rxjs';
import { switchMap, finalize, catchError } from 'rxjs/operators';
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

interface Point {
  x: number;
  y: number;
}

type PortSide = 'top' | 'right' | 'bottom' | 'left';

interface Port extends Point {
  side: PortSide;
}

// Match the pipeline builder node size so saved positions render with the same spacing.
const NODE_WIDTH = 300;
const NODE_HEIGHT = 130;
const H_GAP = 100;
const V_GAP = 40;
const PADDING = 40;

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
  isRefreshing = false;

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

  refreshRun(): void {
    if (!this.run || this.isRefreshing) return;
    this.isRefreshing = true;
    this.apiService.getPipelineRuns().pipe(
      finalize(() => this.isRefreshing = false)
    ).subscribe(runs => {
      const updated = runs.find(r => r.pipelineRunName === this.run?.pipelineRunName);
      if (updated) {
        this.run = updated;
        this.refreshNodeStatuses();
      }
    });
  }

  taskLink(task: PipelineRunTask): string | undefined {
    return task.buildLink || task.deploymentLink || task.prLink;
  }

  openLink(link: string): void {
    window.open(link, '_blank', 'noopener');
  }

  rerunTask(task: PipelineRunTask): void {
    if (!this.run) return;
    this.apiService.rerunTask(this.run.pipelineRunName, task.id).subscribe({
      next: () => {
        this.snackBar.open(`Task "${task.id}" rerun started.`, '', { duration: 2000, panelClass: 'success-snackbar' });
        this.refreshRun();
        if (!this.pollSub) this.startPolling();
      },
      error: () => this.snackBar.open(`Failed to rerun "${task.id}".`, '', { duration: 3000, panelClass: 'error-snackbar' })
    });
  }

  stopTask(task: PipelineRunTask): void {
    if (!this.run) return;
    this.apiService.stopTask(this.run.pipelineRunName, task.id).subscribe({
      next: () => {
        this.snackBar.open(`Task "${task.id}" stopped.`, '', { duration: 2000, panelClass: 'success-snackbar' });
        this.refreshRun();
      },
      error: () => this.snackBar.open(`Failed to stop "${task.id}".`, '', { duration: 3000, panelClass: 'error-snackbar' })
    });
  }

  approveTask(task: PipelineRunTask): void {
    if (!this.run) return;
    this.apiService.approveTask(this.run.pipelineRunName, task.id).subscribe({
      next: () => {
        this.snackBar.open(`Task "${task.id}" approved.`, '', { duration: 2000, panelClass: 'success-snackbar' });
        this.refreshRun();
        if (!this.pollSub) this.startPolling();
      },
      error: () => this.snackBar.open(`Failed to approve "${task.id}".`, '', { duration: 3000, panelClass: 'error-snackbar' })
    });
  }

  canRerun(task: PipelineRunTask): boolean {
    const s = task.status || 'PENDING';
    return s === 'FAILED' || s === 'CANCELLED' || s === 'SUCCEEDED';
  }

  canStop(task: PipelineRunTask): boolean {
    const s = task.status || 'PENDING';
    return s === 'RUNNING' || s === 'PENDING' || s === 'WAITING_APPROVAL';
  }

  canApprove(task: PipelineRunTask): boolean {
    return task.taskType === 'ApprovalTask' && (task.status || 'PENDING') === 'WAITING_APPROVAL';
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
    const posMap = this.savedPositions(tasks) ?? this.levelPositions(tasks, taskMap);

    this.nodes = tasks.map(task => ({ task, ...posMap.get(task.id)! }));

    this.edges = [];
    for (const task of tasks) {
      const src = posMap.get(task.id);
      if (!src) continue;
      for (const nextId of task.nextTaskIds || []) {
        const tgt = posMap.get(nextId);
        if (!tgt) continue;
        const { from, to } = this.bestPorts(src, tgt);
        this.edges.push({ key: `${task.id}-${nextId}`, path: this.bezierPath(from, to) });
      }
    }

    const positions = [...posMap.values()];
    this.canvasWidth = Math.max(...positions.map(p => p.x), 0) + NODE_WIDTH + PADDING;
    this.canvasHeight = Math.max(...positions.map(p => p.y), 0) + NODE_HEIGHT + PADDING;
  }

  /** Positions saved by the builder, shifted so the top-left node sits at the padding; null if any task lacks one. */
  private savedPositions(tasks: PipelineRunTask[]): Map<string, Point> | null {
    const saved = new Map<string, Point>();
    for (const structureTask of this.run?.pipelineStructure?.tasks || []) {
      if (structureTask.position) saved.set(structureTask.id, structureTask.position);
    }
    if (!tasks.length || tasks.some(task => !saved.has(task.id))) return null;

    const points = tasks.map(task => saved.get(task.id)!);
    const minX = Math.min(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const result = new Map<string, Point>();
    for (const task of tasks) {
      const p = saved.get(task.id)!;
      result.set(task.id, { x: p.x - minX + PADDING, y: p.y - minY + PADDING });
    }
    return result;
  }

  private levelPositions(tasks: PipelineRunTask[], taskMap: Record<string, PipelineRunTask>): Map<string, Point> {
    const levels = this.computeLevels(tasks, taskMap);
    const rows = new Map<number, number>();
    const result = new Map<string, Point>();
    for (const task of tasks) {
      const level = levels.get(task.id) || 0;
      const row = rows.get(level) || 0;
      rows.set(level, row + 1);
      result.set(task.id, {
        x: PADDING + level * (NODE_WIDTH + H_GAP),
        y: PADDING + row * (NODE_HEIGHT + V_GAP)
      });
    }
    return result;
  }

  private bestPorts(source: Point, target: Point): { from: Port; to: Port } {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const sp = this.nodePorts(source);
    const tp = this.nodePorts(target);
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? { from: sp.right, to: tp.left } : { from: sp.left, to: tp.right };
    }
    return dy > 0 ? { from: sp.bottom, to: tp.top } : { from: sp.top, to: tp.bottom };
  }

  private nodePorts(pos: Point): Record<PortSide, Port> {
    return {
      top: { side: 'top', x: pos.x + NODE_WIDTH / 2, y: pos.y },
      right: { side: 'right', x: pos.x + NODE_WIDTH, y: pos.y + NODE_HEIGHT / 2 },
      bottom: { side: 'bottom', x: pos.x + NODE_WIDTH / 2, y: pos.y + NODE_HEIGHT },
      left: { side: 'left', x: pos.x, y: pos.y + NODE_HEIGHT / 2 }
    };
  }

  private bezierPath(from: Port, to: Port): string {
    const offset = Math.max(50, Math.min(180, Math.hypot(to.x - from.x, to.y - from.y) * 0.4));
    const c1 = this.controlPoint(from, offset);
    const c2 = this.controlPoint(to, offset);
    return `M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`;
  }

  private controlPoint(port: Port, offset: number): Point {
    switch (port.side) {
      case 'right': return { x: port.x + offset, y: port.y };
      case 'left': return { x: port.x - offset, y: port.y };
      case 'bottom': return { x: port.x, y: port.y + offset };
      case 'top': return { x: port.x, y: port.y - offset };
    }
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
      .filter(t => this.taskLink(t))
      .map(t => `${t.id}-${t.taskType}: ${this.taskLink(t)}`);
  }

  private startPolling(): void {
    if (!this.run || this.isTerminal()) return;

    this.pollSub = interval(5000).pipe(
      switchMap(() => this.apiService.getPipelineRuns().pipe(
        catchError(() => EMPTY)
      ))
    ).subscribe(runs => {
      const updated = runs.find(r => r.pipelineRunName === this.run?.pipelineRunName);
      if (updated) {
        this.run = updated;
        this.refreshNodeStatuses();
        if (this.isTerminal()) {
          this.stopPolling();
        }
      }
    });
  }

  private refreshNodeStatuses(): void {
    const taskMap = this.run?.taskMap;
    if (!taskMap) return;

    this.nodes = this.nodes.map(node => {
      const updated = taskMap[node.task.id];
      return updated ? { ...node, task: updated } : node;
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
  }
}
