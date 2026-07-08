import { OverlayContainer } from '@angular/cdk/overlay';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PipelinesWorkbenchComponent } from './pipelines-workbench.component';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DevOpsConfig, DevOpsProvider, ProviderSettings } from '../../core/models';

describe('PipelinesWorkbenchComponent', () => {
  const provider: DevOpsProvider = 'github';
  const providerSettings: ProviderSettings = {
    pat: 'test-pat',
    organization: 'test-org',
    project: ''
  };
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
    getProviderSettings: () => providerSettings
  };

  const apiServiceStub = {
    getPipelines: () => of([]),
    getPipelineRuns: () => of([]),
    getConfigData: () => of({
      environments: ['production'],
      repoProfiles: []
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
        { provide: MatSnackBar, useValue: snackBarStub }
      ]
    }).compileComponents();
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

    expect(configureButton).not.toBeNull();
    expect(overlayRoot.querySelector('.task-config-window')).toBeNull();

    configureButton?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    configureButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(component.selectedTask()?.editorId).toBe(component.editorNodes[0]?.editorId);
    expect(overlayRoot.querySelector('.task-config-window')).not.toBeNull();
  });
});