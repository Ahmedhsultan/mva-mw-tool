import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { PipelineVariablesDialogComponent } from './pipeline-variables-dialog.component';

describe('PipelineVariablesDialogComponent', () => {
  const dialogRefStub = {
    close: jasmine.createSpy('close')
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelineVariablesDialogComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            variables: []
          }
        },
        {
          provide: MatDialogRef,
          useValue: dialogRefStub
        }
      ]
    }).compileComponents();

    dialogRefStub.close.calls.reset();
  });

  it('collapses a variable after saving it', () => {
    const fixture = TestBed.createComponent(PipelineVariablesDialogComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    component.addVariable();
    const variable = component.variables[0];
    variable.name = 'ENV';
    variable.label = 'Environment';
    variable.defaultValue = 'dev';

    expect(variable.collapsed).toBeFalse();

    component.saveVariable(variable);

    expect(variable.collapsed).toBeTrue();
  });
});