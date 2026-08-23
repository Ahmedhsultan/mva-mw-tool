import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { PipelineVariableDefinition, PipelineVariableValueMap } from '../../../core/models';

export interface PipelineRunVariablesDialogData {
  pipelineName: string;
  variables: PipelineVariableDefinition[];
}

@Component({
  selector: 'app-pipeline-run-variables-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule
  ],
  templateUrl: './pipeline-run-variables-dialog.component.html',
  styleUrl: './pipeline-run-variables-dialog.component.scss'
})
export class PipelineRunVariablesDialogComponent {
  readonly values: PipelineVariableValueMap;

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: PipelineRunVariablesDialogData,
    private dialogRef: MatDialogRef<PipelineRunVariablesDialogComponent, PipelineVariableValueMap | undefined>
  ) {
    this.values = data.variables.reduce<PipelineVariableValueMap>((result, variable) => {
      result[variable.name] = variable.defaultValue ?? '';
      return result;
    }, {});
  }

  get hasMissingRequiredValues(): boolean {
    return this.data.variables.some(variable => variable.required && !this.values[variable.name]?.trim());
  }

  close(): void {
    this.dialogRef.close(undefined);
  }

  submit(): void {
    if (this.hasMissingRequiredValues) {
      return;
    }

    const result = this.data.variables.reduce<PipelineVariableValueMap>((acc, variable) => {
      acc[variable.name] = this.values[variable.name] ?? '';
      return acc;
    }, {});

    this.dialogRef.close(result);
  }
}