import { CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { Overlay, OverlayModule, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Component, ElementRef, OnDestroy, OnInit, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { finalize } from 'rxjs';
import {
  DevOpsProvider,
  PipelineCondition,
  PipelineDto,
  PipelinePayload,
  RepoProfile,
  PipelineRunCredentials,
  PipelineRunDto,
  PipelineTaskNode,
  PipelineTaskStatus,
  PipelineTaskType,
  ProviderSettings
} from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Point {
  x: number;
  y: number;
}

interface EditorPipelineTaskNode extends PipelineTaskNode {
  editorId: string;
  position: Point;
}

interface ToolboxTask {
  type: PipelineTaskType;
  label: string;
  icon: string;
  description: string;
}

interface SmartEdge {
  key: string;
  sourceEditorId: string;
  targetId: string;
  path: string;
}

interface PortInfo {
  side: 'top' | 'right' | 'bottom' | 'left';
  x: number;
  y: number;
}

interface ValidationSummary {
  errors: string[];
  warnings: string[];
}

interface StatusCount {
  status: PipelineTaskStatus;
  count: number;
}

const TOOLBOX_TASKS: ToolboxTask[] = [
  {
    type: 'BuildTask',
    label: 'Build',
    icon: 'construction',
    description: 'Trigger a build definition or workflow.'
  },
  {
    type: 'DeploymentTask',
    label: 'Deploy',
    icon: 'rocket_launch',
    description: 'Deploy the output of a referenced build task.'
  },
  {
    type: 'ApprovalTask',
    label: 'Approval',
    icon: 'verified_user',
    description: 'Add a manual approval gate before downstream tasks.'
  },
  {
    type: 'GitTask',
    label: 'Git Push',
    icon: 'upload_file',
    description: 'Push generated content into a repository file.'
  },
  {
    type: 'PrTask',
    label: 'Pull Request',
    icon: 'merge_type',
    description: 'Model a PR-oriented task in the graph.'
  }
];

const TASK_STATUS_OPTIONS: PipelineTaskStatus[] = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'WAITING_APPROVAL',
  'SKIPPED',
  'RETRYING'
];

const TASK_PREFIX: Record<PipelineTaskType, string> = {
  BuildTask: 'build',
  DeploymentTask: 'deploy',
  ApprovalTask: 'approval',
  GitTask: 'git',
  PrTask: 'pr'
};

@Component({
  selector: 'app-pipelines-workbench',
  standalone: true,
  imports: [
    FormsModule,
    DragDropModule,
    OverlayModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTooltipModule
  ],
  templateUrl: './pipelines-workbench.component.html',
  styleUrl: './pipelines-workbench.component.scss'
})
export class PipelinesWorkbenchComponent implements OnInit, OnDestroy {
  @ViewChild('canvasBoard') canvasBoard?: ElementRef<HTMLDivElement>;
  @ViewChild('builderTpl') builderTpl?: TemplateRef<unknown>;

  readonly toolboxTasks = TOOLBOX_TASKS;
  readonly taskStatuses = TASK_STATUS_OPTIONS;
  readonly providerOptions: DevOpsProvider[] = ['azure', 'github'];

  pipelines: PipelineDto[] = [];
  pipelineRuns: PipelineRunDto[] = [];
  editorNodes: EditorPipelineTaskNode[] = [];

  workbenchTabIndex = 0;
  isBuilderWindowOpen = false;
  draftPipelineName = '';
  selectedPipelineName = '';
  selectedTaskEditorId: string | null = null;
  pendingConnectionSourceEditorId: string | null = null;

  isLoadingPipelines = false;
  isLoadingRuns = false;
  isSavingPipeline = false;
  isRunningPipeline = false;
  pipelinesError = '';
  runsError = '';
  canvasZoom = 1;
  repoProfiles: RepoProfile[] = [];
  configuredEnvironments: string[] = [];
  taskCatalogError = '';
  isLoadingTaskCatalog = false;
  isPanning = false;
  panCursor = 'grab';
  readonly canvasWidth = 12000;
  readonly canvasHeight = 9000;

  private panStartX = 0;
  private panStartY = 0;
  private panScrollX = 0;
  private panScrollY = 0;
  private panMoved = false;
  private readonly canvasOriginX = 900;
  private readonly canvasOriginY = 560;
  private readonly nodeWidth = 240;
  private readonly nodeHeight = 130;
  private pipelineLookup = new Map<string, string>();
  private overlayRef?: OverlayRef;

  constructor(
    private apiService: ApiService,
    private authService: AuthService,
    private snackBar: MatSnackBar,
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef
  ) {}

  ngOnInit(): void {
    this.startNewPipeline(false);
    this.refreshWorkspace();
  }

  get selectedTask(): EditorPipelineTaskNode | null {
    return this.editorNodes.find(node => node.editorId === this.selectedTaskEditorId) || null;
  }

  get pendingConnectionSource(): EditorPipelineTaskNode | null {
    return this.editorNodes.find(node => node.editorId === this.pendingConnectionSourceEditorId) || null;
  }

  get validationSummary(): ValidationSummary {
    return this.buildValidationSummary();
  }

  get smartEdges(): SmartEdge[] {
    const nodeById = new Map(this.editorNodes.map(node => [node.id, node]));
    const edges: SmartEdge[] = [];

    for (const source of this.editorNodes) {
      for (const targetId of source.nextTaskIds) {
        const target = nodeById.get(targetId);
        if (!target) continue;

        const ports = this.bestPorts(source, target);
        edges.push({
          key: `${source.editorId}:${targetId}`,
          sourceEditorId: source.editorId,
          targetId,
          path: this.buildBezierPath(ports.from, ports.to)
        });
      }
    }

    return edges;
  }

  get zoomPercent(): number {
    return Math.round(this.canvasZoom * 100);
  }

  get edgeCount(): number {
    return this.editorNodes.reduce((total, node) => total + node.nextTaskIds.length, 0);
  }

  get rootCount(): number {
    return this.computeRootIds().length;
  }

  refreshWorkspace(): void {
    this.loadPipelines();
    this.loadPipelineRuns();
    this.loadTaskCatalog();
  }

  startNewPipeline(openBuilderWindow = true): void {
    this.selectedPipelineName = '';
    this.selectedTaskEditorId = null;
    this.pendingConnectionSourceEditorId = null;
    this.editorNodes = [];
    this.draftPipelineName = this.generatePipelineName();

    if (openBuilderWindow) {
      this.openBuilderWindow();
    }
  }

  openPipeline(pipeline: PipelineDto): void {
    this.selectedPipelineName = pipeline.pipelineName;
    this.draftPipelineName = pipeline.pipelineName;
    this.pendingConnectionSourceEditorId = null;
    this.editorNodes = this.layoutTasks(pipeline.pipelineStructure.tasks || []);
    this.selectedTaskEditorId = this.editorNodes[0]?.editorId || null;
    this.openBuilderWindow();
  }

  loadRunAsReference(run: PipelineRunDto): void {
    const resolvedName = this.resolvePipelineName(run.pipeline);
    this.selectedPipelineName = resolvedName;
    this.draftPipelineName = resolvedName || this.generatePipelineName();
    this.pendingConnectionSourceEditorId = null;
    this.editorNodes = this.layoutTasks(run.pipeline?.tasks || []);
    this.selectedTaskEditorId = this.editorNodes[0]?.editorId || null;
    this.openBuilderWindow();
  }

  openBuilderWindow(): void {
    this.isBuilderWindowOpen = true;
    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        hasBackdrop: false,
        positionStrategy: this.overlay.position().global(),
        scrollStrategy: this.overlay.scrollStrategies.block()
      });
    }
    if (this.builderTpl && !this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new TemplatePortal(this.builderTpl, this.viewContainerRef));
    }
    setTimeout(() => this.resetCanvasViewport(), 0);
  }

  closeBuilderWindow(): void {
    this.isBuilderWindowOpen = false;
    this.pendingConnectionSourceEditorId = null;
    this.overlayRef?.detach();
  }

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
  }

  zoomIn(): void { this.canvasZoom = Math.min(2, +(this.canvasZoom + 0.1).toFixed(2)); }
  zoomOut(): void { this.canvasZoom = Math.max(0.25, +(this.canvasZoom - 0.1).toFixed(2)); }
  resetZoom(): void { this.canvasZoom = 1; }

  onCanvasWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.05 : 0.05;
      this.canvasZoom = Math.min(2, Math.max(0.25, +(this.canvasZoom + delta).toFixed(2)));
    }
  }

  onCanvasPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !this.canvasBoard) return;
    const target = event.target as HTMLElement;
    if (target.closest('.pipeline-node, .port, .connect-banner, .task-config-window, .builder-quick-actions, button')) return;

    const el = this.canvasBoard.nativeElement;
    this.isPanning = true;
    this.panMoved = false;
    this.panCursor = 'grabbing';
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    this.panScrollX = el.scrollLeft;
    this.panScrollY = el.scrollTop;
    el.setPointerCapture(event.pointerId);
  }

  onCanvasPointerMove(event: PointerEvent): void {
    if (!this.isPanning || !this.canvasBoard) return;
    const dx = event.clientX - this.panStartX;
    const dy = event.clientY - this.panStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.panMoved = true;
    this.canvasBoard.nativeElement.scrollLeft = this.panScrollX - dx;
    this.canvasBoard.nativeElement.scrollTop = this.panScrollY - dy;
  }

  onCanvasPointerUp(event: PointerEvent): void {
    if (!this.isPanning) return;
    this.isPanning = false;
    this.panCursor = 'grab';
    if (!this.panMoved) {
      this.clearSelection();
    }
  }

  promptSave(): void {
    const name = prompt('Pipeline name:', this.draftPipelineName);
    if (name !== null && name.trim()) {
      this.draftPipelineName = name.trim();
      this.savePipeline();
    }
  }

  onPortClick(editorId: string, event: Event): void {
    event.stopPropagation();
    if (this.pendingConnectionSourceEditorId) {
      if (this.pendingConnectionSourceEditorId !== editorId) {
        this.completeConnection(editorId, event);
      }
    } else {
      this.startConnection(editorId, event);
    }
  }

  savePipeline(): void {
    const pipelineName = this.draftPipelineName.trim();
    if (!pipelineName) {
      this.showMessage('Pipeline name is required before saving.', 'error-snackbar');
      return;
    }

    const validation = this.validationSummary;
    if (validation.errors.length) {
      this.showMessage('Resolve validation errors before saving the pipeline.', 'error-snackbar');
      return;
    }

    this.isSavingPipeline = true;
    this.apiService.createPipeline(pipelineName, this.buildPayload())
      .pipe(finalize(() => this.isSavingPipeline = false))
      .subscribe({
        next: () => {
          this.selectedPipelineName = pipelineName;
          this.showMessage(`Pipeline "${pipelineName}" saved.`, 'success-snackbar');
          this.loadPipelines();
        },
        error: () => {
          this.showMessage('Could not save the pipeline.', 'error-snackbar');
        }
      });
  }

  runActivePipeline(): void {
    if (!this.selectedPipelineName) {
      this.showMessage('Save the draft before running it.', 'error-snackbar');
      return;
    }

    this.runSavedPipeline(this.selectedPipelineName);
  }

  runSavedPipeline(pipelineName: string): void {
    const pipeline = this.pipelines.find(candidate => candidate.pipelineName === pipelineName);
    if (!pipeline) {
      this.showMessage('The selected pipeline is not available in the backend.', 'error-snackbar');
      return;
    }

    const providers = this.collectProviders(pipeline.pipelineStructure.tasks || []);
    const missing = this.validateRunCredentials(providers);
    if (missing.length) {
      this.showMessage(missing[0], 'error-snackbar');
      return;
    }

    this.isRunningPipeline = true;
    this.apiService.runPipeline(pipelineName, this.buildRunCredentials(providers))
      .pipe(finalize(() => this.isRunningPipeline = false))
      .subscribe({
        next: () => {
          this.showMessage(`Pipeline "${pipelineName}" started.`, 'success-snackbar');
          this.loadPipelineRuns();
          this.closeBuilderWindow();
          this.workbenchTabIndex = 1;
        },
        error: () => {
          this.showMessage('Could not start the pipeline run.', 'error-snackbar');
        }
      });
  }

  addTaskFromToolbox(taskType: PipelineTaskType): void {
    const offset = 32 + (this.editorNodes.length % 4) * 24;
    this.addTask(taskType, {
      x: this.canvasOriginX + offset,
      y: this.canvasOriginY + offset
    });
  }

  onToolboxDragStart(event: DragEvent, taskType: PipelineTaskType): void {
    event.dataTransfer?.setData('application/x-mva-task-type', taskType);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();

    const taskType = event.dataTransfer?.getData('application/x-mva-task-type') as PipelineTaskType;
    if (!taskType || !this.canvasBoard) {
      return;
    }

    const el = this.canvasBoard.nativeElement;
    const rect = el.getBoundingClientRect();
    const position = {
      x: Math.max(24, (event.clientX - rect.left + el.scrollLeft) / this.canvasZoom - this.nodeWidth / 2),
      y: Math.max(24, (event.clientY - rect.top + el.scrollTop) / this.canvasZoom - 54)
    };

    this.addTask(taskType, position);
  }

  onNodeDragEnded(task: EditorPipelineTaskNode, event: CdkDragEnd): void {
    const position = event.source.getFreeDragPosition();
    task.position = {
      x: Math.min(this.canvasWidth - this.nodeWidth - 24, Math.max(12, position.x)),
      y: Math.min(this.canvasHeight - this.nodeHeight - 24, Math.max(12, position.y))
    };
  }

  selectTask(editorId: string, event?: Event): void {
    event?.stopPropagation();
    this.selectedTaskEditorId = editorId;
  }

  clearSelection(): void {
    this.selectedTaskEditorId = null;
  }

  clearPendingConnection(): void {
    this.pendingConnectionSourceEditorId = null;
  }

  startConnection(editorId: string, event: Event): void {
    event.stopPropagation();
    this.selectedTaskEditorId = editorId;
    this.pendingConnectionSourceEditorId = this.pendingConnectionSourceEditorId === editorId ? null : editorId;
  }

  completeConnection(targetEditorId: string, event: Event): void {
    event.stopPropagation();

    if (!this.pendingConnectionSourceEditorId || this.pendingConnectionSourceEditorId === targetEditorId) {
      return;
    }

    const source = this.findNodeByEditorId(this.pendingConnectionSourceEditorId);
    const target = this.findNodeByEditorId(targetEditorId);
    if (!source || !target) {
      this.pendingConnectionSourceEditorId = null;
      return;
    }

    if (!source.id.trim() || !target.id.trim()) {
      this.showMessage('Each task needs an id before it can be connected.', 'error-snackbar');
      return;
    }

    if (source.nextTaskIds.includes(target.id)) {
      this.pendingConnectionSourceEditorId = null;
      return;
    }

    source.nextTaskIds = [...source.nextTaskIds, target.id];
    this.pendingConnectionSourceEditorId = null;
    this.selectedTaskEditorId = targetEditorId;
  }

  removeConnection(sourceEditorId: string, targetId: string): void {
    const node = this.findNodeByEditorId(sourceEditorId);
    if (!node) {
      return;
    }

    node.nextTaskIds = node.nextTaskIds.filter(nextTaskId => nextTaskId !== targetId);
  }

  deleteTask(editorId: string, event?: Event): void {
    event?.stopPropagation();

    const removed = this.findNodeByEditorId(editorId);
    if (!removed) {
      return;
    }

    this.editorNodes = this.editorNodes
      .filter(node => node.editorId !== editorId)
      .map(node => ({
        ...node,
        nextTaskIds: node.nextTaskIds.filter(nextTaskId => nextTaskId !== removed.id),
        conditions: node.conditions.filter(condition => condition.taskId !== removed.id),
        buildTaskId: node.taskType === 'DeploymentTask' && node.buildTaskId === removed.id ? '' : node.buildTaskId
      }));

    if (this.selectedTaskEditorId === editorId) {
      this.selectedTaskEditorId = this.editorNodes[0]?.editorId || null;
    }

    if (this.pendingConnectionSourceEditorId === editorId) {
      this.pendingConnectionSourceEditorId = null;
    }
  }

  updateTaskId(editorId: string, newId: string): void {
    const task = this.findNodeByEditorId(editorId);
    if (!task) {
      return;
    }

    const previousId = task.id;
    task.id = newId;

    if (previousId === newId) {
      return;
    }

    for (const node of this.editorNodes) {
      if (node.editorId !== editorId) {
        node.nextTaskIds = node.nextTaskIds.map(nextTaskId => nextTaskId === previousId ? newId : nextTaskId);
      }

      node.conditions = node.conditions.map(condition => condition.taskId === previousId
        ? { ...condition, taskId: newId }
        : condition
      );

      if (node.taskType === 'DeploymentTask' && node.buildTaskId === previousId) {
        node.buildTaskId = newId;
      }
    }
  }

  addCondition(task: EditorPipelineTaskNode): void {
    const firstCandidate = this.editorNodes.find(node => node.editorId !== task.editorId)?.id || '';
    task.conditions = [
      ...task.conditions,
      {
        taskId: firstCandidate,
        status: 'SUCCEEDED'
      }
    ];
  }

  removeCondition(task: EditorPipelineTaskNode, index: number): void {
    task.conditions = task.conditions.filter((_, conditionIndex) => conditionIndex !== index);
  }

  incomingTaskIds(task: EditorPipelineTaskNode): string[] {
    return this.editorNodes
      .filter(node => node.nextTaskIds.includes(task.id))
      .map(node => node.id);
  }

  buildTaskOptions(currentTask: EditorPipelineTaskNode): EditorPipelineTaskNode[] {
    return this.editorNodes.filter(node => node.taskType === 'BuildTask' && node.editorId !== currentTask.editorId);
  }

  conditionTaskOptions(currentTask: EditorPipelineTaskNode): EditorPipelineTaskNode[] {
    return this.editorNodes.filter(node => node.editorId !== currentTask.editorId);
  }

  selectedRepoProfileKey(task: EditorPipelineTaskNode): string {
    const match = this.repoProfiles.find(repoProfile => {
      const repoId = this.profileRepoId(repoProfile);
      if (repoId !== (task.repoName || '')) {
        return false;
      }

      if (task.taskType === 'BuildTask' && repoProfile.buildDefinitionId && task.definitionId) {
        return repoProfile.buildDefinitionId === task.definitionId;
      }

      if (task.taskType === 'DeploymentTask' && repoProfile.deploymentDefinitionId && task.definitionId) {
        return repoProfile.deploymentDefinitionId === task.definitionId;
      }

      return true;
    });

    return match ? this.repoProfileKey(match) : '';
  }

  applyRepoProfileSelection(task: EditorPipelineTaskNode, repoProfileKey: string): void {
    const repoProfile = this.repoProfiles.find(candidate => this.repoProfileKey(candidate) === repoProfileKey);
    if (!repoProfile) {
      return;
    }

    this.applyRepoProfileToTask(task, repoProfile);
  }

  repoProfileLabel(repoProfile: RepoProfile): string {
    const suffix = repoProfile.type === 'library' ? 'Library' : 'Service';
    return `${this.profileRepoId(repoProfile)} · ${suffix}`;
  }

  environmentOptions(task: EditorPipelineTaskNode): string[] {
    const values = new Set(this.configuredEnvironments);
    if (task.environment?.trim()) {
      values.add(task.environment.trim());
    }
    return [...values];
  }

  availableRepoProfiles(task: EditorPipelineTaskNode): RepoProfile[] {
    if (task.taskType === 'DeploymentTask') {
      return this.repoProfiles.filter(repoProfile => repoProfile.type !== 'library');
    }

    return this.repoProfiles;
  }

  taskMeta(taskType: PipelineTaskType): ToolboxTask {
    return this.toolboxTasks.find(task => task.type === taskType) || this.toolboxTasks[0];
  }

  taskLabel(taskType: PipelineTaskType): string {
    return this.taskMeta(taskType).label;
  }

  taskIcon(taskType: PipelineTaskType): string {
    return this.taskMeta(taskType).icon;
  }

  providerLabel(provider: DevOpsProvider): string {
    return provider === 'github' ? 'GitHub' : 'Azure DevOps';
  }

  providerIcon(provider: DevOpsProvider): string {
    return provider === 'github' ? 'code' : 'cloud';
  }

  nodeSummary(node: PipelineTaskNode): string {
    switch (node.taskType) {
      case 'BuildTask':
        return `${node.repoName || 'repo'} • ${node.branch || 'branch'} • definition ${node.definitionId || 'n/a'}`;
      case 'DeploymentTask':
        return `${node.environment || 'environment'} • build ${node.buildTaskId || 'missing'} • definition ${node.definitionId || 'n/a'}`;
      case 'ApprovalTask':
        return node.approved ? 'Approval already granted' : 'Manual approval gate';
      case 'GitTask':
        return `${node.repoName || 'repo'} • ${node.branch || 'branch'} • ${node.filePath || 'file path'}`;
      case 'PrTask':
        return `${node.repoName || 'repo'} • ${node.fromBranch || 'source'} -> ${node.targetBranch || 'target'}`;
      default:
        return 'Configure the selected task.';
    }
  }

  pipelineProvidersLabel(pipeline: PipelineDto): string {
    const providers = this.collectProviders(pipeline.pipelineStructure.tasks || []);
    return providers.map(provider => this.providerLabel(provider)).join(' + ');
  }

  pipelineNameForRun(run: PipelineRunDto): string {
    return this.resolvePipelineName(run.pipeline) || 'Historical run';
  }

  runStatusCounts(run: PipelineRunDto): StatusCount[] {
    const counts = new Map<PipelineTaskStatus, number>();
    const tasks = Object.values(run.graph?.taskMap || {});

    for (const task of tasks) {
      if (!task.status) {
        continue;
      }

      counts.set(task.status, (counts.get(task.status) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((left, right) => right.count - left.count);
  }

  overallRunStatus(run: PipelineRunDto): PipelineTaskStatus {
    const tasks = Object.values(run.graph?.taskMap || {});
    if (!tasks.length) {
      return 'PENDING';
    }

    const statuses = tasks.map(task => task.status || 'PENDING');
    if (statuses.includes('FAILED')) {
      return 'FAILED';
    }
    if (statuses.includes('RUNNING')) {
      return 'RUNNING';
    }
    if (statuses.includes('WAITING_APPROVAL')) {
      return 'WAITING_APPROVAL';
    }
    if (statuses.every(status => status === 'SUCCEEDED')) {
      return 'SUCCEEDED';
    }
    if (statuses.includes('CANCELLED')) {
      return 'CANCELLED';
    }
    return 'PENDING';
  }

  statusTone(status: PipelineTaskStatus): string {
    switch (status) {
      case 'SUCCEEDED':
        return 'is-success';
      case 'FAILED':
      case 'CANCELLED':
        return 'is-danger';
      case 'RUNNING':
      case 'RETRYING':
        return 'is-running';
      case 'WAITING_APPROVAL':
        return 'is-waiting';
      default:
        return 'is-neutral';
    }
  }

  readableStatus(status: PipelineTaskStatus): string {
    return status.toLowerCase().replace(/_/g, ' ');
  }

  private loadPipelines(): void {
    this.isLoadingPipelines = true;
    this.pipelinesError = '';

    this.apiService.getPipelines()
      .pipe(finalize(() => this.isLoadingPipelines = false))
      .subscribe({
        next: pipelines => {
          this.pipelines = [...pipelines];
          this.rebuildPipelineLookup();
        },
        error: () => {
          this.pipelinesError = 'Could not load saved pipelines from the backend.';
        }
      });
  }

  private loadPipelineRuns(): void {
    this.isLoadingRuns = true;
    this.runsError = '';

    this.apiService.getPipelineRuns()
      .pipe(finalize(() => this.isLoadingRuns = false))
      .subscribe({
        next: runs => {
          this.pipelineRuns = [...runs].reverse();
        },
        error: () => {
          this.runsError = 'Could not load pipeline history. The backend run endpoint may still be initializing runtime status serialization.';
        }
      });
  }

  private loadTaskCatalog(): void {
    const config = this.authService.getConfig();
    const configProvider = this.authService.getTabProvider('config');
    const repoId = config.dbRepoId.trim();
    const branch = config.dbBranch.trim() || 'main';

    if (!repoId) {
      this.repoProfiles = [];
      this.configuredEnvironments = [];
      this.taskCatalogError = 'Set a config repo in Workspace settings to use repository presets in the builder.';
      return;
    }

    this.isLoadingTaskCatalog = true;
    this.taskCatalogError = '';

    this.apiService.getConfigData(configProvider, repoId, branch)
      .pipe(finalize(() => this.isLoadingTaskCatalog = false))
      .subscribe({
        next: configData => {
          this.repoProfiles = this.normalizeRepoProfiles(configData.repoProfiles, configData.repositories);
          this.configuredEnvironments = [...configData.environments];
          if (!this.repoProfiles.length) {
            this.taskCatalogError = 'No repository presets saved yet. Add them in Workspace settings to auto-fill build and deploy tasks.';
          }
        },
        error: () => {
          this.repoProfiles = [];
          this.configuredEnvironments = [];
          this.taskCatalogError = 'Repository presets are unavailable until Workspace settings can load repo config.';
        }
      });
  }

  private addTask(taskType: PipelineTaskType, position: Point): void {
    const task = this.createEditorTask(taskType, position);
    this.editorNodes = [...this.editorNodes, task];
    this.selectedTaskEditorId = task.editorId;
  }

  private createEditorTask(taskType: PipelineTaskType, position: Point): EditorPipelineTaskNode {
    const provider = this.authService.getTabProvider('pipelines');

    return {
      editorId: this.createEditorId(),
      position,
      id: this.generateTaskId(taskType),
      taskType,
      devOpsServiceFactory: provider,
      conditions: [],
      nextTaskIds: [],
      branch: taskType === 'GitTask' ? 'main' : 'refs/heads/main',
      repoName: '',
      definitionId: '',
      buildTaskId: '',
      environment: taskType === 'DeploymentTask' ? (this.configuredEnvironments[0] || 'production') : '',
      description: '',
      approved: false,
      fromBranch: 'feature/new-change',
      targetBranch: 'main',
      filePath: '',
      content: '',
      commitMessage: 'Update generated file'
    };
  }

  private bestPorts(source: EditorPipelineTaskNode, target: EditorPipelineTaskNode): { from: PortInfo; to: PortInfo } {
    const w = this.nodeWidth, h = this.nodeHeight;
    const dx = (target.position.x + w / 2) - (source.position.x + w / 2);
    const dy = (target.position.y + h / 2) - (source.position.y + h / 2);

    const sp = this.nodePorts(source.position);
    const tp = this.nodePorts(target.position);

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx > 0 ? { from: sp.right, to: tp.left } : { from: sp.left, to: tp.right };
    }
    return dy > 0 ? { from: sp.bottom, to: tp.top } : { from: sp.top, to: tp.bottom };
  }

  private nodePorts(pos: Point): { top: PortInfo; right: PortInfo; bottom: PortInfo; left: PortInfo } {
    const w = this.nodeWidth, h = this.nodeHeight;
    return {
      top: { side: 'top', x: pos.x + w / 2, y: pos.y },
      right: { side: 'right', x: pos.x + w, y: pos.y + h / 2 },
      bottom: { side: 'bottom', x: pos.x + w / 2, y: pos.y + h },
      left: { side: 'left', x: pos.x, y: pos.y + h / 2 }
    };
  }

  private buildBezierPath(from: PortInfo, to: PortInfo): string {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const offset = Math.max(50, Math.min(180, dist * 0.4));
    const c1 = this.ctrlPt(from, offset);
    const c2 = this.ctrlPt(to, offset);
    return `M${from.x},${from.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${to.x},${to.y}`;
  }

  private ctrlPt(port: PortInfo, offset: number): Point {
    switch (port.side) {
      case 'right': return { x: port.x + offset, y: port.y };
      case 'left': return { x: port.x - offset, y: port.y };
      case 'bottom': return { x: port.x, y: port.y + offset };
      case 'top': return { x: port.x, y: port.y - offset };
    }
  }

  private layoutTasks(tasks: PipelineTaskNode[]): EditorPipelineTaskNode[] {
    const draftNodes = tasks.map(task => this.hydrateTask(task));
    const levels = this.computeTaskLevels(draftNodes);
    const rows = new Map<number, number>();

    return draftNodes.map(node => {
      const level = levels.get(node.id) || 0;
      const row = rows.get(level) || 0;
      rows.set(level, row + 1);

      return {
        ...node,
        position: {
          x: this.canvasOriginX + level * 300,
          y: this.canvasOriginY + row * 180
        }
      };
    });
  }

  private applyRepoProfileToTask(task: EditorPipelineTaskNode, repoProfile: RepoProfile): void {
    const repoId = this.profileRepoId(repoProfile);

    if (repoId) {
      task.repoName = repoId;
    }

    switch (task.taskType) {
      case 'BuildTask':
        if (repoProfile.buildDefinitionId.trim()) task.definitionId = repoProfile.buildDefinitionId.trim();
        break;
      case 'DeploymentTask':
        if (repoProfile.deploymentDefinitionId.trim()) task.definitionId = repoProfile.deploymentDefinitionId.trim();
        break;
    }
  }

  private profileRepoId(repoProfile: RepoProfile): string {
    return (repoProfile.repoId || repoProfile.name).trim();
  }

  private repoProfileKey(repoProfile: RepoProfile): string {
    return (repoProfile.repoId || repoProfile.name).trim().toLowerCase();
  }

  private normalizeRepoProfiles(repoProfiles: RepoProfile[] | undefined, repositories: string[] | undefined): RepoProfile[] {
    const normalized = new Map<string, RepoProfile>();

    for (const repoProfile of repoProfiles || []) {
      const normalizedProfile: RepoProfile = {
        name: repoProfile.repoId?.trim() || repoProfile.name?.trim() || '',
        repoId: repoProfile.repoId?.trim() || repoProfile.name?.trim() || '',
        type: repoProfile.type === 'library' ? 'library' : 'service',
        branch: '',
        buildDefinitionId: repoProfile.buildDefinitionId?.trim() || '',
        deploymentDefinitionId: repoProfile.type === 'library' ? '' : repoProfile.deploymentDefinitionId?.trim() || '',
        environment: '',
        description: ''
      };

      const key = this.repoProfileKey(normalizedProfile);
      if (key) {
        normalized.set(key, normalizedProfile);
      }
    }

    for (const repository of repositories || []) {
      const repoId = repository.trim();
      if (!repoId) {
        continue;
      }

      const fallbackProfile: RepoProfile = {
        name: repoId,
        repoId,
        type: 'service',
        branch: '',
        buildDefinitionId: '',
        deploymentDefinitionId: '',
        environment: '',
        description: ''
      };

      const key = this.repoProfileKey(fallbackProfile);
      if (!normalized.has(key)) {
        normalized.set(key, fallbackProfile);
      }
    }

    return [...normalized.values()];
  }

  private resetCanvasViewport(): void {
    if (!this.canvasBoard) {
      return;
    }

    const canvasBoard = this.canvasBoard.nativeElement;

    if (!this.editorNodes.length) {
      canvasBoard.scrollLeft = Math.max(0, this.canvasOriginX - 220);
      canvasBoard.scrollTop = Math.max(0, this.canvasOriginY - 180);
      return;
    }

    const minX = Math.min(...this.editorNodes.map(node => node.position.x));
    const minY = Math.min(...this.editorNodes.map(node => node.position.y));
    canvasBoard.scrollLeft = Math.max(0, minX - 220);
    canvasBoard.scrollTop = Math.max(0, minY - 180);
  }

  private hydrateTask(task: PipelineTaskNode): EditorPipelineTaskNode {
    return {
      editorId: this.createEditorId(),
      position: { x: 0, y: 0 },
      id: task.id,
      taskType: task.taskType,
      devOpsServiceFactory: task.devOpsServiceFactory,
      conditions: (task.conditions || []).map(condition => ({ ...condition })),
      nextTaskIds: [...(task.nextTaskIds || [])],
      branch: task.branch || (task.taskType === 'GitTask' ? 'main' : 'refs/heads/main'),
      repoName: task.repoName || '',
      definitionId: task.definitionId || '',
      buildTaskId: task.buildTaskId || '',
      environment: task.environment || '',
      description: task.description || '',
      approved: task.approved || false,
      fromBranch: task.fromBranch || '',
      targetBranch: task.targetBranch || '',
      filePath: task.filePath || '',
      content: task.content || '',
      commitMessage: task.commitMessage || ''
    };
  }

  private computeTaskLevels(tasks: EditorPipelineTaskNode[]): Map<string, number> {
    const indegree = new Map<string, number>();
    const children = new Map<string, string[]>();

    for (const task of tasks) {
      indegree.set(task.id, 0);
      children.set(task.id, []);
    }

    for (const task of tasks) {
      for (const nextTaskId of task.nextTaskIds) {
        if (!indegree.has(nextTaskId)) {
          continue;
        }

        children.get(task.id)?.push(nextTaskId);
        indegree.set(nextTaskId, (indegree.get(nextTaskId) || 0) + 1);
      }
    }

    const queue = [...indegree.entries()]
      .filter(([, count]) => count === 0)
      .map(([id]) => id);
    const levels = new Map<string, number>();

    for (const id of queue) {
      levels.set(id, 0);
    }

    while (queue.length) {
      const current = queue.shift()!;
      const currentLevel = levels.get(current) || 0;

      for (const child of children.get(current) || []) {
        levels.set(child, Math.max(levels.get(child) || 0, currentLevel + 1));
        indegree.set(child, (indegree.get(child) || 0) - 1);
        if ((indegree.get(child) || 0) === 0) {
          queue.push(child);
        }
      }
    }

    for (const task of tasks) {
      if (!levels.has(task.id)) {
        levels.set(task.id, 0);
      }
    }

    return levels;
  }

  private buildPayload(): PipelinePayload {
    return {
      tasks: [...this.editorNodes]
        .sort((left, right) => {
          if (left.position.x === right.position.x) {
            return left.position.y - right.position.y;
          }
          return left.position.x - right.position.x;
        })
        .map(node => this.serializeTask(node))
    };
  }

  private serializeTask(node: EditorPipelineTaskNode): PipelineTaskNode {
    const task: PipelineTaskNode = {
      id: node.id.trim(),
      taskType: node.taskType,
      devOpsServiceFactory: node.devOpsServiceFactory,
      conditions: node.conditions.map(condition => ({
        taskId: condition.taskId.trim(),
        status: condition.status
      })),
      nextTaskIds: [...new Set(node.nextTaskIds.filter(nextTaskId => nextTaskId.trim()))]
    };

    switch (node.taskType) {
      case 'BuildTask':
        task.branch = node.branch?.trim() || '';
        task.repoName = node.repoName?.trim() || '';
        task.definitionId = node.definitionId?.trim() || '';
        break;
      case 'DeploymentTask':
        task.buildTaskId = node.buildTaskId?.trim() || '';
        task.repoName = node.repoName?.trim() || '';
        task.definitionId = node.definitionId?.trim() || '';
        task.environment = node.environment?.trim() || '';
        task.description = node.description?.trim() || '';
        break;
      case 'ApprovalTask':
        task.approved = !!node.approved;
        break;
      case 'GitTask':
        task.repoName = node.repoName?.trim() || '';
        task.branch = node.branch?.trim() || '';
        task.filePath = node.filePath?.trim() || '';
        task.content = node.content || '';
        task.commitMessage = node.commitMessage?.trim() || '';
        break;
      case 'PrTask':
        task.fromBranch = node.fromBranch?.trim() || '';
        task.targetBranch = node.targetBranch?.trim() || '';
        task.repoName = node.repoName?.trim() || '';
        break;
    }

    return task;
  }

  private buildValidationSummary(): ValidationSummary {
    const errors: string[] = [];
    const warnings: string[] = [];
    const ids = new Set<string>();
    const incoming = new Map<string, number>();
    const nodeIds = this.editorNodes.map(node => node.id.trim()).filter(Boolean);
    const buildIds = new Set(this.editorNodes
      .filter(node => node.taskType === 'BuildTask')
      .map(node => node.id.trim())
      .filter(Boolean));

    if (!this.editorNodes.length) {
      errors.push('Add at least one task node to the graph.');
      return { errors, warnings };
    }

    for (const node of this.editorNodes) {
      const id = node.id.trim();
      if (!id) {
        errors.push(`${this.taskLabel(node.taskType)} task is missing an id.`);
      } else if (ids.has(id)) {
        errors.push(`Task id "${id}" is duplicated.`);
      } else {
        ids.add(id);
        incoming.set(id, 0);
      }

      if (!node.devOpsServiceFactory) {
        errors.push(`Task "${id || this.taskLabel(node.taskType)}" is missing a provider.`);
      }

      this.validateRequiredFields(node, errors);
    }

    for (const node of this.editorNodes) {
      for (const nextTaskId of node.nextTaskIds) {
        const trimmedTarget = nextTaskId.trim();
        if (!trimmedTarget) {
          errors.push(`Task "${node.id || this.taskLabel(node.taskType)}" has an empty outgoing connection.`);
          continue;
        }

        if (trimmedTarget === node.id.trim()) {
          errors.push(`Task "${node.id}" cannot connect to itself.`);
          continue;
        }

        if (!ids.has(trimmedTarget)) {
          errors.push(`Task "${node.id}" points to missing task "${trimmedTarget}".`);
          continue;
        }

        incoming.set(trimmedTarget, (incoming.get(trimmedTarget) || 0) + 1);
      }

      for (const condition of node.conditions) {
        if (!condition.taskId.trim()) {
          errors.push(`Task "${node.id || this.taskLabel(node.taskType)}" has a condition with no source task.`);
        } else if (!ids.has(condition.taskId.trim())) {
          errors.push(`Task "${node.id || this.taskLabel(node.taskType)}" depends on missing task "${condition.taskId}".`);
        }

        if (!this.taskStatuses.includes(condition.status)) {
          errors.push(`Task "${node.id || this.taskLabel(node.taskType)}" uses unsupported status "${condition.status}".`);
        }
      }

      if (node.taskType === 'DeploymentTask' && node.buildTaskId?.trim() && !buildIds.has(node.buildTaskId.trim())) {
        errors.push(`Deployment task "${node.id || 'deployment'}" must reference an existing BuildTask.`);
      }
    }

    const rootIds = [...incoming.entries()].filter(([, count]) => count === 0).map(([id]) => id);
    if (!rootIds.length) {
      errors.push('The graph needs at least one root task.');
    }

    for (const node of this.editorNodes) {
      const id = node.id.trim();
      if (!id) {
        continue;
      }

      const isIsolated = (incoming.get(id) || 0) === 0 && node.nextTaskIds.length === 0 && nodeIds.length > 1;
      if (isIsolated) {
        warnings.push(`Task "${id}" is isolated from the rest of the graph.`);
      }
    }

    return {
      errors: [...new Set(errors)],
      warnings: [...new Set(warnings)]
    };
  }

  private validateRequiredFields(node: EditorPipelineTaskNode, errors: string[]): void {
    const taskId = node.id.trim() || this.taskLabel(node.taskType);

    switch (node.taskType) {
      case 'BuildTask':
        if (!node.branch?.trim()) errors.push(`Build task "${taskId}" requires a branch.`);
        if (!node.repoName?.trim()) errors.push(`Build task "${taskId}" requires a repo name.`);
        if (!node.definitionId?.trim()) errors.push(`Build task "${taskId}" requires a definition id.`);
        break;
      case 'DeploymentTask':
        if (!node.buildTaskId?.trim()) errors.push(`Deployment task "${taskId}" requires a build task reference.`);
        if (!node.definitionId?.trim()) errors.push(`Deployment task "${taskId}" requires a definition id.`);
        if (!node.environment?.trim()) errors.push(`Deployment task "${taskId}" requires an environment.`);
        break;
      case 'GitTask':
        if (!node.repoName?.trim()) errors.push(`Git task "${taskId}" requires a repo name.`);
        if (!node.branch?.trim()) errors.push(`Git task "${taskId}" requires a branch.`);
        if (!node.filePath?.trim()) errors.push(`Git task "${taskId}" requires a file path.`);
        if (!node.content?.length) errors.push(`Git task "${taskId}" requires content.`);
        if (!node.commitMessage?.trim()) errors.push(`Git task "${taskId}" requires a commit message.`);
        break;
      case 'PrTask':
        if (!node.repoName?.trim()) errors.push(`PR task "${taskId}" requires a repo name.`);
        if (!node.fromBranch?.trim()) errors.push(`PR task "${taskId}" requires a source branch.`);
        if (!node.targetBranch?.trim()) errors.push(`PR task "${taskId}" requires a target branch.`);
        break;
    }
  }

  private computeRootIds(): string[] {
    const incoming = new Map<string, number>();

    for (const node of this.editorNodes) {
      incoming.set(node.id, 0);
    }

    for (const node of this.editorNodes) {
      for (const nextTaskId of node.nextTaskIds) {
        if (incoming.has(nextTaskId)) {
          incoming.set(nextTaskId, (incoming.get(nextTaskId) || 0) + 1);
        }
      }
    }

    return [...incoming.entries()].filter(([, count]) => count === 0).map(([id]) => id);
  }

  private collectProviders(tasks: PipelineTaskNode[]): DevOpsProvider[] {
    return [...new Set(tasks.map(task => task.devOpsServiceFactory))];
  }

  private validateRunCredentials(providers: DevOpsProvider[]): string[] {
    const messages: string[] = [];

    for (const provider of providers) {
      const credentials = this.authService.getProviderSettings(provider);
      if (!credentials.pat.trim()) {
        messages.push(`${this.providerLabel(provider)} token is required to run this pipeline.`);
      }
      if (!credentials.organization.trim()) {
        messages.push(`${this.providerLabel(provider)} organization is required to run this pipeline.`);
      }
      if (!credentials.project.trim()) {
        messages.push(`${this.providerLabel(provider)} project is required to run this pipeline.`);
      }
    }

    return messages;
  }

  private buildRunCredentials(providers: DevOpsProvider[]): PipelineRunCredentials {
    const payload: PipelineRunCredentials = {};

    if (providers.includes('azure')) {
      payload.azure = this.toRunCredential(this.authService.getProviderSettings('azure'));
    }

    if (providers.includes('github')) {
      payload.github = this.toRunCredential(this.authService.getProviderSettings('github'));
    }

    return payload;
  }

  private toRunCredential(settings: ProviderSettings) {
    return {
      pat: settings.pat,
      organization: settings.organization,
      project: settings.project
    };
  }

  private generatePipelineName(): string {
    const knownNames = new Set(this.pipelines.map(pipeline => pipeline.pipelineName));
    let index = this.pipelines.length + 1;

    while (knownNames.has(`pipeline-${index}`)) {
      index += 1;
    }

    return `pipeline-${index}`;
  }

  private generateTaskId(taskType: PipelineTaskType): string {
    const prefix = TASK_PREFIX[taskType];
    const existingIds = new Set(this.editorNodes.map(node => node.id));
    let index = 1;

    while (existingIds.has(`${prefix}-${index}`)) {
      index += 1;
    }

    return `${prefix}-${index}`;
  }

  private createEditorId(): string {
    return `editor-${Math.random().toString(36).slice(2, 10)}`;
  }

  private findNodeByEditorId(editorId: string): EditorPipelineTaskNode | undefined {
    return this.editorNodes.find(node => node.editorId === editorId);
  }

  private rebuildPipelineLookup(): void {
    this.pipelineLookup = new Map(
      this.pipelines.map(pipeline => [
        this.normalizePayload(pipeline.pipelineStructure),
        pipeline.pipelineName
      ])
    );
  }

  private resolvePipelineName(payload: PipelinePayload | undefined): string {
    if (!payload) {
      return '';
    }

    return this.pipelineLookup.get(this.normalizePayload(payload)) || '';
  }

  private normalizePayload(payload: PipelinePayload): string {
    return JSON.stringify({
      tasks: [...(payload.tasks || [])]
        .map(task => ({
          ...task,
          nextTaskIds: [...(task.nextTaskIds || [])].sort(),
          conditions: [...(task.conditions || [])].sort((left: PipelineCondition, right: PipelineCondition) => {
            if (left.taskId === right.taskId) {
              return left.status.localeCompare(right.status);
            }
            return left.taskId.localeCompare(right.taskId);
          })
        }))
        .sort((left, right) => left.id.localeCompare(right.id))
    });
  }

  private showMessage(message: string, panelClass: 'success-snackbar' | 'error-snackbar'): void {
    this.snackBar.open(message, 'Close', {
      duration: 2600,
      panelClass
    });
  }
}