import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'reservations', pathMatch: 'full' },
  { path: 'reservations', loadComponent: () => import('./components/environment-reservation/environment-reservation.component').then(m => m.EnvironmentReservationComponent) },
  { path: 'pipeline', loadComponent: () => import('./components/cicd-pipeline/cicd-pipeline.component').then(m => m.CicdPipelineComponent) },
  { path: 'pipeline/run/:runId', loadComponent: () => import('./components/cicd-pipeline/cicd-pipeline.component').then(m => m.CicdPipelineComponent) },
  { path: 'pipeline/:subTab', loadComponent: () => import('./components/cicd-pipeline/cicd-pipeline.component').then(m => m.CicdPipelineComponent) },
  { path: 'resources', loadComponent: () => import('./components/vois-resources/vois-resources.component').then(m => m.VoisResourcesComponent) },
  { path: 'deploy-branch', loadComponent: () => import('./components/deploy-branch/deploy-branch.component').then(m => m.DeployBranchComponent) },
  { path: 'tools', loadComponent: () => import('./components/tools/tools.component').then(m => m.ToolsComponent) },
  { path: '**', redirectTo: 'reservations' },
];
