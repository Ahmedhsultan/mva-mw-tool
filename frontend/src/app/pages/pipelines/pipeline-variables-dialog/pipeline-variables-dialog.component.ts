import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PipelineVariableDefinition } from '../../../core/models';

export interface PipelineVariablesDialogData {
  variables: PipelineVariableDefinition[];
}

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface VariableDraft extends PipelineVariableDefinition {
  editorId: string;
  collapsed: boolean;
}

@Component({
  selector: 'app-pipeline-variables-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule
  ],
  templateUrl: './pipeline-variables-dialog.component.html',
  styleUrl: './pipeline-variables-dialog.component.scss'
})
export class PipelineVariablesDialogComponent {
  readonly variables: VariableDraft[];

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: PipelineVariablesDialogData,
    private dialogRef: MatDialogRef<PipelineVariablesDialogComponent, PipelineVariableDefinition[] | undefined>
  ) {
    this.variables = (data.variables || []).map(variable => ({
      editorId: this.createEditorId(),
      name: variable.name || '',
      label: variable.label || '',
      defaultValue: variable.defaultValue || '',
      required: !!variable.required,
      description: variable.description || '',
      collapsed: true
    }));
  }

  get variableCount(): number {
    return this.normalizedVariables().length;
  }

  get requiredCount(): number {
    return this.normalizedVariables().filter(variable => variable.required).length;
  }

  get canSave(): boolean {
    return this.variables.every(variable => this.isVariableValid(variable));
  }

  addVariable(): void {
    this.variables.push({
      editorId: this.createEditorId(),
      name: this.generateVariableName(),
      label: '',
      defaultValue: '',
      required: false,
      description: '',
      collapsed: false
    });
  }

  removeVariable(index: number): void {
    this.variables.splice(index, 1);
  }

  variableDisplayName(variable: PipelineVariableDefinition): string {
    return variable.label?.trim() || variable.name?.trim() || 'Variable';
  }

  variableSubtitle(variable: PipelineVariableDefinition): string {
    const parts = [variable.name?.trim() || 'Unnamed'];
    if ((variable.defaultValue ?? '').trim()) {
      parts.push(`Default: ${variable.defaultValue.trim()}`);
    }
    if (variable.required) {
      parts.push('Required');
    }
    return parts.join('  •  ');
  }

  expandVariable(variable: VariableDraft): void {
    variable.collapsed = false;
  }

  saveVariable(variable: VariableDraft): void {
    if (!this.isVariableValid(variable)) {
      return;
    }

    variable.name = variable.name.trim();
    variable.label = variable.label.trim();
    variable.description = variable.description?.trim() || '';
    variable.collapsed = true;
  }

  isVariableValid(variable: VariableDraft): boolean {
    const name = variable.name.trim();
    if (!name || !VARIABLE_NAME_PATTERN.test(name)) {
      return false;
    }

    return !this.variables.some(candidate => candidate.editorId !== variable.editorId && candidate.name.trim() === name);
  }

  close(): void {
    this.dialogRef.close(undefined);
  }

  save(): void {
    if (!this.canSave) {
      return;
    }

    this.dialogRef.close(this.normalizedVariables());
  }

  private normalizedVariables(): PipelineVariableDefinition[] {
    return this.variables
      .filter(variable => !this.isEmptyVariable(variable))
      .map(variable => ({
        name: variable.name.trim(),
        label: variable.label.trim(),
        defaultValue: variable.defaultValue ?? '',
        required: !!variable.required,
        description: variable.description?.trim() || ''
      }));
  }

  private isEmptyVariable(variable: PipelineVariableDefinition): boolean {
    return !variable.name.trim()
      && !variable.label.trim()
      && !(variable.defaultValue ?? '').trim()
      && !variable.description?.trim()
      && !variable.required;
  }

  private generateVariableName(): string {
    const names = new Set(this.normalizedVariables().map(variable => variable.name));
    let index = this.variables.length + 1;

    while (names.has(`VAR_${index}`)) {
      index += 1;
    }

    return `VAR_${index}`;
  }

  private createEditorId(): string {
    return `variable-${Math.random().toString(36).slice(2, 10)}`;
  }
}