import { OverlayContainer } from '@angular/cdk/overlay';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PipelinesWorkbenchComponent } from './pipelines-workbench.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DevOpsConfig, DevOpsProvider, ProviderSettings } from '../../core/models';
import { PipelineVariablesDialogComponent } from './pipeline-variables-dialog/pipeline-variables-dialog.component';
import { PipelineRunVariablesDialogComponent } from './pipeline-run-variables-dialog/pipeline-run-variables-dialog.component';

describe('PipelinesWorkbenchComponent', () => {
  const provider: DevOpsProvider = 'github';
  const providerSettings: ProviderSettings = {
    pat: 'test-pat',
    organization: 'test-org',
    project: ''
  };
  const connectors = [{
    name: 'github',
    type: 'github' as const,
    pat: 'test-pat',
    organization: 'test-org',
    project: ''
  }];
  const config: DevOpsConfig = {
    provider,
    azurePat: '',
    githubPat: providerSettings.pat,
    azureOrganization: '',
    azureProject: '',
    githubOrganization: providerSettings.organization,
    githubProject: providerSettings.project,
    organization: providerSettings.organization,
    project: providerSettings.project,
    environments: [],
    dbRepoId: 'mva-mw-tool',
    dbBranch: 'main',
    tabProviders: {
      overview: provider,
      pipelines: provider,
      config: provider
    }
  };

  const authServiceStub = {
    getConfig: () => config,
    getTabProvider: () => provider,
    getProviderSettings: () => providerSettings,
    getConnectors: () => connectors,
    getConfigConnector: () => 'github',
    getConnector: (name: string) => connectors.find(connector => connector.name === name)
  };

  const apiServiceStub = {
    getPipelines: () => of([]),
    getPipelineRuns: () => of([]),
    getConfigData: () => of({
      environments: ['production'],
      repoProfiles: []
    }),
    runPipeline: jasmine.createSpy('runPipeline').and.returnValue(of(true))
  };

  const dialogStub = {
    open: jasmine.createSpy('open').and.returnValue({
      afterClosed: () => of({ ENV: 'prod' })
    })
  };

  const snackBarStub = {
    open: () => undefined
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelinesWorkbenchComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ApiService, useValue: apiServiceStub },
        { provide: AuthService, useValue: authServiceStub },
        { provide: MatDialog, useValue: dialogStub },
        { provide: MatSnackBar, useValue: snackBarStub }
      ]
    }).compileComponents();

    apiServiceStub.runPipeline.calls.reset();
    dialogStub.open.calls.reset();
  });

  it('renders the task config drawer when the configure button is clicked', async () => {
    const fixture = TestBed.createComponent(PipelinesWorkbenchComponent);
    const component = fixture.componentInstance;
    const overlayContainer = TestBed.inject(OverlayContainer);

    fixture.detectChanges();
    component.openBuilderWindow();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));

    component.addTaskFromToolbox('BuildTask');
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));

    component.clearSelection();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));

    const overlayRoot = overlayContainer.getContainerElement();
    const configureButton = overlayRoot.querySelector('.node-config-btn') as HTMLButtonElement | null;
    const drawer = overlayRoot.querySelector('.task-config-window') as HTMLElement | null;

    expect(configureButton).not.toBeNull();
    expect(drawer).not.toBeNull();
    expect(drawer?.textContent).toContain('Select a task');

    configureButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    configureButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(component.selectedTask()?.editorId).toBe(component.editorNodes[0]?.editorId);
    expect(overlayRoot.querySelector('.task-config-window')?.textContent).toContain('Task id');
  });

  it('includes pipeline variables in the saved payload', async () => {
    const fixture = TestBed.createComponent(PipelinesWorkbenchComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    component.pipelineVariables = [{
      name: 'ENV',
      label: 'Environment',
      defaultValue: 'dev',
      required: true,
      description: 'Target environment'
    }];

    component.addTaskFromToolbox('BuildTask');
    const task = component.editorNodes[0];
    task.id = 'build-1';
    task.repoName = 'service-a';
    task.branch = 'refs/heads/${ENV}';
    task.definitionId = 'workflow-1';

    const payload = (component as any).buildPayload();

    expect(payload.variables).toEqual([{
      name: 'ENV',
      label: 'Environment',
      defaultValue: 'dev',
      required: true,
      description: 'Target environment'
    }]);
  });

  it('opens the variables dialog and forwards selected values when running a saved pipeline', async () => {
    const fixture = TestBed.createComponent(PipelinesWorkbenchComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    component.pipelines = [{
      pipelineName: 'release-pipeline',
      pipelineStructure: {
        variables: [{
          name: 'ENV',
          label: 'Environment',
          defaultValue: 'dev',
          required: true,
          description: ''
        }],
        tasks: [{
          id: 'build-1',
          taskType: 'BuildTask',
          devOpsServiceFactory: 'github',
          conditions: [],
          nextTaskIds: [],
          branch: 'refs/heads/${ENV}',
          repoName: 'service-a',
          definitionId: 'workflow-1'
        }]
      }
    }];

    component.runSavedPipeline('release-pipeline');

    expect(dialogStub.open).toHaveBeenCalledWith(PipelineRunVariablesDialogComponent, jasmine.objectContaining({
      data: jasmine.objectContaining({ pipelineName: 'release-pipeline' })
    }));
    expect(apiServiceStub.runPipeline).toHaveBeenCalledWith(
      'github',
      'mva-mw-tool',
      'main',
      'release-pipeline',
      jasmine.objectContaining({
        variables: { ENV: 'prod' }
      })
    );
  });

  it('opens the builder variables dialog and saves returned variables', async () => {
    const fixture = TestBed.createComponent(PipelinesWorkbenchComponent);
    const component = fixture.componentInstance;

    dialogStub.open.and.returnValueOnce({
      afterClosed: () => of([{
        name: 'ENV',
        label: 'Environment',
        defaultValue: 'dev',
        required: true,
        description: 'Target environment'
      }])
    });

    fixture.detectChanges();
    component.openPipelineVariablesDialog();

    expect(dialogStub.open).toHaveBeenCalledWith(PipelineVariablesDialogComponent, jasmine.objectContaining({
      data: jasmine.objectContaining({ variables: [] })
    }));
    expect(component.pipelineVariables).toEqual([{
      name: 'ENV',
      label: 'Environment',
      defaultValue: 'dev',
      required: true,
      description: 'Target environment'
    }]);
  });
});