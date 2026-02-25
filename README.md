# MVA MW Tool — Developer Documentation

A _VOIS internal web application for **environment reservations**, **automated CI/CD release pipelines**, and **branch deployments** against Azure DevOps, backed by Firebase Firestore.

**Live URL:** https://mva-mw-tool.web.app

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Configuration & Setup](#5-configuration--setup)
6. [Application Routes](#6-application-routes)
7. [Feature: Environment Reservation Calendar](#7-feature-environment-reservation-calendar)
8. [Feature: CI/CD Release Pipeline](#8-feature-cicd-release-pipeline)
9. [Feature: Deploy Branch](#9-feature-deploy-branch)
10. [Services](#10-services)
11. [Data Models](#11-data-models)
12. [Firebase Collections](#12-firebase-collections)
13. [Azure DevOps API Reference](#13-azure-devops-api-reference)
14. [Known Behaviors & Edge Cases](#14-known-behaviors--edge-cases)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Overview

MVA MW Tool is a single-page Angular 19 application serving three primary functions:

| Tab | Purpose |
|-----|---------|
| **Environment Reservation** | Weekly calendar to reserve test/QC environments, preventing deployment clashes across the team. |
| **Deploy Branch** | Targeted 5-step pipeline to build and deploy any feature branch across selected microservices and environments, with run persistence, resume-after-refresh, rerun controls, and local run history. |
| **CI/CD Pipeline** | Automated 5-step Azure DevOps release pipeline — branch creation, PR, dual build (release + master), master deploy, release deploy — with Firestore-backed run history, concurrent viewer tracking, per-row and step-level refresh & rerun. |

**Tab order in the navigation bar:** Reservations → Deploy Branch → Release CUT-OFF → VOIS Resources

Both tabs share the same Firebase project for real-time synchronisation (Firestore) and anonymous authentication.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Angular 19.2.0 (standalone components, `@for`/`@if` control flow) |
| Language | TypeScript 5.7 |
| Styling | Plain CSS — _VOIS brand red `#E60000`, running state blue `#2563eb` |
| Database | Firebase 11.10.0 — Firestore + Anonymous Auth |
| Angular Firebase | @angular/fire 19.2.0 |
| CI/CD Automation | Azure DevOps REST API v7.1 (direct browser `fetch` with PAT) |
| Hosting | Firebase Hosting — https://mva-mw-tool.web.app |
| Build tool | Angular CLI 19.2.5 |

---

## 3. Project Structure

```
mva-mw-tool/
├── src/
│   ├── index.html              # Entry HTML
│   ├── main.ts                 # Angular bootstrap
│   ├── styles.css              # Global styles
│   └── app/
│       ├── app.component.*     # Root shell — top navigation tabs
│       ├── app.config.ts       # Angular providers (router, Firebase)
│       ├── app.routes.ts       # Lazy-loaded route definitions
│       ├── firebase.config.ts  # Firebase project credentials
│       │
│       ├── models/
│       │   ├── reservation.model.ts       # Reservation interface + ENVIRONMENTS
│       │   └── release-pipeline.model.ts  # PipelineStep, ServiceStepResult,
│       │                                  # PipelineRunRecord, MICROSERVICES,
│       │                                  # LIBRARY_SERVICES, getReleaseBranch()
│       │
│       ├── services/
│       │   ├── auth.service.ts              # Firebase anonymous auth
│       │   ├── reservation.service.ts       # Firestore CRUD for reservations
│       │   ├── pipeline-history.service.ts  # Firestore CRUD for pipeline-runs
│       │   ├── azure-devops.service.ts      # All Azure DevOps REST API calls
│       │   └── run-presence.service.ts      # Concurrent viewer heartbeat/tracking
│       │
│       └── components/
│           ├── environment-reservation/    # Calendar + booking modal
│           ├── deploy-branch/              # Deploy Branch — 5-step pipeline, history, rerun
│           │   ├── deploy-branch.component.ts   # ~780 lines — all logic + interfaces
│           │   ├── deploy-branch.component.html # ~520 lines — form, run view, history
│           │   └── deploy-branch.component.css  # ~750 lines — full component styles
│           └── cicd-pipeline/              # Full pipeline UI + orchestration (~1400 lines)
│
├── angular.json                # Angular CLI workspace config
├── firebase.json               # Hosting SPA rewrite rule
├── .firebaserc                 # Firebase project alias
└── package.json
```

---

## 4. Architecture

```
Browser (Angular SPA)
│
├── /reservations
│   └── EnvironmentReservationComponent
│       └── ReservationService ──────────────► Firestore: "reservations"
│
├── /deploy-branch
│   └── DeployBranchComponent
│       └── (direct browser fetch with PAT) ─► Azure DevOps REST API v7.1
│           PAT / run state / history stored     org: vfuk-digital / project: Digital
│           in localStorage only (no Firebase)
│
└── /pipeline  (+/pipeline/:subTab  + /pipeline/run/:runId)
    └── CicdPipelineComponent
        ├── AzureDevOpsService ──────────────► Azure DevOps REST API v7.1
        │   (PAT stored in localStorage)       org: vfuk-digital / project: Digital
        ├── PipelineHistoryService ──────────► Firestore: "pipeline-runs"
        ├── RunPresenceService ──────────────► Firestore: "pipeline-runs/{id}/viewers"
        └── AuthService ─────────────────────► Firebase Anonymous Auth
```

All Firestore subscriptions use real-time listeners (`collectionData`, `onSnapshot`), so every open tab reflects changes immediately.

The Deploy Branch tab operates entirely in `localStorage` — no Firestore is used. State is isolated per browser.

---

## 5. Configuration & Setup

### Prerequisites

- Node.js 18+
- Angular CLI: `npm install -g @angular/cli`
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project (Firestore + Anonymous Auth enabled)
- An Azure DevOps Personal Access Token (PAT)

### Install dependencies

```bash
npm install
```

### Firebase setup

1. Go to https://console.firebase.google.com — create a project.
2. Enable **Firestore** in Native mode.
3. Enable **Authentication → Anonymous** sign-in.
4. Register a **Web app** and copy the config snippet into `src/app/firebase.config.ts`:

```typescript
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

5. Set Firestore security rules to allow authenticated (anonymous) users:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

6. Authenticate CLI and select project:

```bash
firebase login
firebase use mva-mw-tool
```

### Local development

```bash
ng serve
# → http://localhost:4200
```

### Production build & deploy

```bash
npx ng build --configuration production
firebase deploy --only hosting
```

`firebase.json` rewrites all routes to `index.html` for SPA client-side routing.

---

## 6. Application Routes

| URL | Component | Description |
|-----|-----------|-------------|
| `/` | — | Redirects to `/reservations` |
| `/reservations` | EnvironmentReservationComponent | Environment reservation calendar |
| `/deploy-branch` | DeployBranchComponent | Deploy Branch — form + pipeline runner |
| `/pipeline` | CicdPipelineComponent | Pipeline (defaults to Run sub-tab) |
| `/pipeline/run` | CicdPipelineComponent | Pipeline Run sub-tab |
| `/pipeline/logs` | CicdPipelineComponent | Activity Logs sub-tab |
| `/pipeline/history` | CicdPipelineComponent | Run History sub-tab |
| `/pipeline/resources` | CicdPipelineComponent | VOIS Resources sub-tab |
| `/pipeline/run/:runId` | CicdPipelineComponent | Deep-link to a specific run |
| `**` | — | Redirects to `/reservations` |

All components are lazy-loaded via dynamic `import()`. The active sub-tab is reflected in the URL using `Location.replaceState()` (no history stack entry added).

---

## 7. Feature: Environment Reservation Calendar

### How it works

Shows a **7-day week view** with environments as rows and days as columns. Users can:

- Navigate between weeks (Previous / Next / Today buttons).
- Click any cell to open a booking modal for that environment + date.
- Hover a coloured chip to see a tooltip with the owner's name, date range, and a delete button.
- All changes sync in real time across all browser sessions.

### Environments

```typescript
export const ENVIRONMENTS = [
  'int1', 'dev1', 'qcx', 'qc1', 'qc2', 'qc5', 'prodsup', 'pat2', 'pat3'
] as const;
```

### Data model

```typescript
interface Reservation {
  id: string;          // Firestore document ID (auto-generated)
  userName: string;    // Free-text name entered by the user
  environment: string; // One of ENVIRONMENTS
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;     // "YYYY-MM-DD" (inclusive)
}
```

A reservation renders a coloured chip on every day in `[startDate, endDate]` for the matching environment row.

---

## 8. Feature: CI/CD Release Pipeline

### 8.1 Overview

Automates the standard _VOIS release flow across all selected microservices:

```
Step 1  Create Release Branch
Step 2  Create Pull Request   (release branch → master)
Step 3  Build Release + Master in parallel
Step 4  Deploy Master build   → target environment
        ⏸  Manual Approval Gate
Step 5  Deploy Release build  → target environment
```

Steps run **sequentially** — a failed step stops the pipeline. Within each step, all selected services run concurrently.

### 8.2 PAT Configuration

Required Azure DevOps PAT scopes:

| Scope | Permission |
|-------|-----------|
| Code | Read & Write |
| Build | Read & Execute |
| Release | Read, Write & Execute |

The PAT, organisation (`vfuk-digital`), and project (`Digital`) are saved to **`localStorage`** via `persistConfig()` and restored on reload via `restoreConfig()`. They are never written to Firebase. Click **Change PAT** in the sidebar to update.

### 8.3 Microservices & Library Services

```typescript
export const MICROSERVICES = [
  'mvax-api', 'mvax-native-billing', 'mvax-offers', 'mvax-upgrades',
  'mvax-authentication', 'mvax-plan-services', 'mvax-adobe-integrator',
  'mvax-account-dashboard',
  'mvax-common',            // Library service
  'mvax-population-engine', // Library service
] as const;
```

**Library services** (`mvax-common`, `mvax-population-engine`) have special handling:

| Behaviour | Regular service | Library service |
|-----------|----------------|----------------|
| Release branch name | `release/primary/{relNum}` | `primary/{relNum}` |
| Base branch | `release/develop` | `develop` (mvax-common) / `release/develop` (mvax-population-engine) |
| Step 3 Build | Release + master | Release + master |
| Step 4 Deploy Master | Yes | **Skipped** |
| Step 5 Deploy Release | Yes | **Skipped** |

### 8.4 Branch Naming

```
Regular services:
  Base branch:    release/develop
  Release branch: release/primary/{releaseNumber}    e.g. release/primary/24.3

mvax-common (library):
  Base branch:    develop
  Release branch: primary/{releaseNumber}            e.g. primary/24.3

mvax-population-engine (library):
  Base branch:    release/develop
  Release branch: primary/{releaseNumber}            e.g. primary/24.3
```

The helper `getReleaseBranch(svc, releaseNumber)` in `release-pipeline.model.ts` encapsulates this logic.

### 8.5 Step Details

#### Step 1 — Create Release Branch

`AzureDevOpsService.createBranch(repo, releaseNumber)`:

1. Determines the correct base branch (see §8.4).
2. Fetches the tip SHA of the base branch via the Git Refs API.
3. POSTs a new ref at `refs/heads/{releaseBranch}`.

Fails if the branch already exists — delete it in Azure DevOps before retrying.

#### Step 2 — Create Pull Request

`AzureDevOpsService.createPullRequest(repo, releaseNumber)`:

- POSTs a PR: `{releaseBranch}` → `master`. Title: `Release {relNum} – {repo}`.
- Returns the PR URL for the "View PR" link in the result row.
- Fails (409) if an identical PR already exists.

#### Step 3 — Build Release & Master

Queues two concurrent builds per service:

| Result row | Branch |
|-----------|--------|
| `{svc} (release)` | `release/primary/{relNum}` or `primary/{relNum}` for libraries |
| `{svc} (master)` | `master` |

`waitForBuild()` polls every **5 seconds**, max 720 polls (60 minutes). Build IDs are stored in `result.buildId` and in-memory maps for deploy steps.

#### Step 4 — Deploy Master Build

For each non-library service:

1. Finds the release definition for the repo.
2. Creates a new Azure DevOps Release using the master `buildId` as the artifact.
3. Stores `result.sourceBuildId = buildId`.
4. `waitForDeployment()` polls every 5 s until the environment reaches a terminal status.

Deployment status code mapping:

| Code(s) | Name | Treatment |
|---------|------|-----------|
| 0, 1, 2, 7, 64, 128 | undefined / notStarted / inProgress / queued / scheduled / pending | Keep polling |
| 4 | succeeded | ✅ Success |
| 3, 5, 6, 8, 16, 32 | partiallySucceeded / rejected / canceled | ❌ Failure |

#### Step 5 — Deploy Release Build

Identical to Step 4, but uses the **release** `buildId`. Only runs after the manual approval gate.

### 8.6 Manual Approval Gate

After Step 4 completes, the pipeline suspends execution via a JavaScript `Promise` stored in `this.approvalResolver`. The stepper shows an **Approve & Deploy Release** banner.

Only the **run creator** can approve (`canApprove()` checks `currentUserUid === record.createdBy`). Other viewers see the button disabled.

### 8.7 Sub-tabs

| Sub-tab | Content |
|---------|---------|
| **Pipeline Run** | Live 5-step stepper with result rows, status dots, messages, and action buttons |
| **Activity Logs** | Timestamped log lines appended throughout execution |
| **Run History** | Last 50 runs from Firestore; click any row to view it in the stepper |
| **VOIS Resources** | Searchable links / files panel |

### 8.8 Run History & Deep Linking

Every pipeline run is saved as a `PipelineRunRecord` in Firestore and updated after each step. Records are streamed in real time.

Deep-link to a specific run via `/pipeline/run/:runId`. The component queues `runId` as `pendingRunId` and opens it once the Firestore subscription fires.

### 8.9 Concurrent Viewer Presence

When a user opens any run, `RunPresenceService.joinRun(runId)` writes a presence document to `pipeline-runs/{runId}/viewers/{uid}` and sends a heartbeat every **20 seconds**. Viewers not seen in **60 seconds** are considered stale and removed from the display. The run viewer header shows coloured avatar chips for all other active viewers.

On navigation away or component destroy, `leaveRun()` deletes the presence document.

### 8.10 Refresh & Rerun Buttons

**Per-row buttons** (Steps 3–5):

| Button | Action |
|--------|--------|
| Refresh | Single status snapshot from Azure; updates the row in-place; persists to Firestore |
| Rerun (build) | Queues a new build on the same branch and waits for it |
| Rerun (deploy) | Creates a new Azure Release. Uses the **latest successful Step 3 build** for that service variant (master/release), falling back to `sourceBuildId` only if no Step 3 result matches |

**Step-level buttons** (Steps 3–5 header):

| Button | Action |
|--------|--------|
| Refresh All | Refreshes all non-skipped rows concurrently; recomputes step status |
| Rerun All | Reruns all non-skipped rows sequentially; recomputes step status |

During any rerun, `viewingRun.status` updates to `RUNNING` immediately. On completion it is recomputed from actual step statuses.

### 8.11 Auto-Continue After Successful Refresh

If `refreshStep()` or `rerunStep()` transitions a step `failed → success` **and** the pipeline is idle **and** there are remaining steps, `continueAfterStep(stepIndex)` fires automatically:

1. Finds the Firestore run record.
2. Verifies the current user is the run owner.
3. Restores `releaseNumber`, `releaseEnvironment`, `selectedServices` from the record.
4. Sets `isRunning = true`, clears `viewingRun`, calls `resumePipeline(record)`.

This enables full pipeline recovery from Run History without re-filling the form.

### 8.12 Resume on Browser Refresh

On `ngOnInit`, after Firestore history loads, `tryRestoreAndResume()` searches for a `status: running` record owned by the current user and calls `resumePipeline(record)`:

- Skips `success` / `skipped` steps.
- For `build-both`: re-fetches status of all stored build IDs; waits for in-progress ones.
- For deploy steps: uses `sourceBuildId` stored in result rows.
- For `waiting-approval`: restores the approval gate.

### 8.13 Multi-User Safety

`canStart()` blocks pipeline launch if any Firestore record has `status: running` and is not owned by the current user. A warning banner names the release in progress. Only one pipeline can be active at a time.

Run ownership is `record.createdBy = currentUserUid`, set at creation time and never changed.

---

## 9. Feature: Deploy Branch

### 9.1 Overview

The Deploy Branch tab provides a targeted deployment pipeline for feature branches. Unlike the CI/CD Release Pipeline (which automates full release flows), Deploy Branch lets you pick any branch, any subset of microservices, and any set of target environments, then runs a lightweight 5-step pipeline:

```
Step 1  Validate PAT             Check that the stored PAT is valid
Step 2  Check Branch Exists      Verify the branch exists in each selected repo
Step 3  Reserve Environments     Check env availability; wait for approval if reserved
Step 4  Build Branch             Queue & wait for Azure DevOps builds
Step 5  Deploy to Environments   Create & wait for Azure DevOps releases
```

Steps run **sequentially**. If any step fails the pipeline stops. Within each step all selected services run concurrently.

### 9.2 PAT Configuration

On first load the component shows a PAT config card. Enter:

- **Personal Access Token** — Azure DevOps PAT
- **Organisation** — defaults to `vfuk-digital`
- **Project** — defaults to `Digital`

The config is saved to `localStorage` under the key `azure-devops-config` (same key as the CI/CD Pipeline tab — both tabs share the same stored PAT). Click **Change PAT** to update at any time.

Required PAT scopes:

| Scope | Permission |
|-------|-----------|
| Code | Read |
| Build | Read & Execute |
| Release | Read, Write & Execute |

### 9.3 Form Inputs

| Field | Description |
|-------|-------------|
| **Branch Name** | Any valid Azure DevOps branch name (e.g. `feature/my-ticket`) |
| **Services** | Multi-select chips (Select All / Clear All helpers). Same list as CI/CD Pipeline: `mvax-api`, `mvax-native-billing`, `mvax-offers`, `mvax-upgrades`, `mvax-authentication`, `mvax-plan-services`, `mvax-adobe-integrator`, `mvax-account-dashboard`, `mvax-common`, `mvax-population-engine` |
| **Target Environments** | Multi-select chips: `int1`, `dev1`, `qcx`, `qc1`, `qc2`, `qc5`, `prodsup`, `pat2`, `pat3` |

The right column shows a **"What will happen"** preview of the 5 steps before the pipeline is started.

### 9.4 5-Step Pipeline Detail

#### Step 1 — Validate PAT

Calls `GET _apis/build/builds` with a small `$top=1` query. If it succeeds the PAT is valid. If it returns `401` the step fails immediately.

#### Step 2 — Check Branch Exists

For each selected service, calls the Azure DevOps Git Refs API to verify the branch exists. Services where the branch is missing are flagged as `failed` and visible in the Branch Check result card.

#### Step 3 — Reserve Environments

Checks the Firestore `reservations` collection for each selected environment. If any environment is currently reserved by another user an **Approval Gate** modal appears. The user must acknowledge and confirm before the pipeline proceeds.

#### Step 4 — Build Branch

For each selected service:
1. Finds the build definition for that repository.
2. Queues a build on the specified branch.
3. Polls every 5 seconds (max 60 minutes) via `waitForBuild()`.
4. Stores `buildId` and `buildUrl` on the task item so a **View ↗** link is shown.

#### Step 5 — Deploy to Environments

For each (service × environment) combination:
1. Finds the release definition for the repository.
2. Creates a new Azure DevOps Release using the `buildId` from Step 4.
3. Polls every 5 seconds (max 60 minutes) via `waitForDeployment()`.
4. Stores `releaseId` and `releaseUrl` on the deployment task so a **View ↗** link is shown.

### 9.5 Run View Layout

While the pipeline is running (or after it completes) the form is replaced by a two-column run view:

**Left column (main):**
- PAT Validation result card
- Branch Check result card (one row per service)
- Env Reservation result card
- Build result card (one row per service, with View ↗ link)
- Deploy result cards — one card per environment, one row per service (with View ↗ link)
- Activity Log (light background, timestamped lines)
- Complete bar: **← New Deploy** | **Rerun Build & Deploy** | **Rerun Deploy Only**

**Right column (step tracker, sticky):**
- 5-step visual tracker with coloured circles (`pending` / `running` / `success` / `failed`)
- Each step has a **↺** button to refresh/rerun that individual step

### 9.6 Run Persistence

The active run is saved to `localStorage` (`db-run-state`) on every log line and every status change. This means:

- **Refresh during a run** — the component detects `isRunning: true` in storage, marks the run as interrupted, and shows the Interrupted banner rather than losing all progress.
- **Refresh after a completed run** — the full run view is restored exactly as it was (all results, logs, and step statuses).
- The stored state is cleared when the user clicks **← New Deploy** or starts a rerun.

**localStorage key:** `db-run-state`  
**Schema:** serialised `DeployRunState` (see §11 Data Models)

### 9.7 Interrupted Run & Resume

When the component loads and finds `db-run-state` with `isRunning: true`, it sets `wasInterrupted = true` and shows a **yellow interrupted banner** with three action buttons:

| Button | Action |
|--------|--------|
| **Resume from Build** | Re-polls the existing build IDs (no re-queue). Resumes build polling from where it left off, then runs Step 5. Available only if at least one build ID is stored. |
| **Resume from Deploy** | Re-polls the existing release IDs. Available only if at least one release ID is stored. |
| **Rerun from scratch** | Equivalent to Rerun Build & Deploy — starts a fresh pipeline. |

Smart resume avoids wasting build minutes by reattaching to already-queued or in-progress builds rather than queuing new ones.

### 9.8 Rerun Controls

**From the complete bar (after a run finishes):**

| Button | Action |
|--------|--------|
| **Rerun Build & Deploy** | Queues fresh builds for all services, waits, then deploys |
| **Rerun Deploy Only** | Creates new releases using the existing `buildId`s stored in the current run |

**Per-step ↺ buttons (in the step tracker):**

| Step | ↺ Action |
|------|---------|
| Validate PAT | Re-validate the PAT against Azure DevOps |
| Check Branch | Re-check all branches |
| Reserve Environments | Re-check live reservations |
| Build | Rerun Build & Deploy (same as complete-bar button) |
| Deploy | Rerun Deploy Only (same as complete-bar button) |

### 9.9 Run History

Completed and interrupted runs are appended to the history list stored at `localStorage` key `db-run-history`. The list is capped at **20 entries** (oldest removed first).

The history panel (below the form or run view) shows:

- A toggle bar with run count badge
- One row per run: branch name, services list, date/time, overall status badge, mini pipeline-state dots
- **Clicking a row** → restores that run as the active view (all results, logs, step statuses)
- **Chevron button (▸)** → expand/collapse the inline detail panel without leaving the current view

**Expanded history detail panel contains:**
- Step status track (coloured circles for each of the 5 steps)
- Build results section with ↺ rerun button per-row (after the View ↗ link)
- Deploy results section with ↺ rerun button per-row (after the View ↗ link)
- Section-level ↺ buttons at the top of Build and Deploy sections
- Full activity log (light background)
- Action buttons: **Rerun All** (full fresh pipeline) | **Rerun Build & Deploy** | **Rerun Deploy Only**

`hasBuildIds(run)` is checked before showing "Rerun Deploy Only" — the button is hidden if no build IDs are available.

### 9.10 Key Methods Reference

| Method | Signature | Purpose |
|--------|-----------|---------|
| `run()` | `async run()` | Full 5-step pipeline from the form |
| `_doDeployStep(services, envs)` | `private async` | Shared deploy logic (used by run / resume / rerun) |
| `resumeFromBuild()` | `async` | Re-polls existing build IDs then deploys |
| `resumeFromDeploy()` | `async` | Re-polls existing release IDs |
| `rerunBuildStep()` | `async` | Queues fresh builds + deploys |
| `rerunDeployStep()` | `async` | Creates new releases from stored build IDs |
| `rerunPatStep()` | `async` | Refresh PAT validation only |
| `rerunBranchStep()` | `async` | Re-check all branch existence |
| `rerunEnvStep()` | `async` | Re-check live env reservations |
| `openHistoryRun(run)` | `void` | Restore a history entry as the active view |
| `rerunAllFromHistory(run)` | `async` | Full fresh pipeline from a history entry |
| `rerunBuildFromHistory(run)` | `async` | Build + deploy from a history entry |
| `rerunDeployFromHistory(run)` | `async` | Deploy only from a history entry |
| `hasBuildIds(run)` | `boolean` | Guard: does this history entry have build IDs? |
| `canResumeBuild()` | `boolean` | Guard for Resume from Build button |
| `canResumeDeploy()` | `boolean` | Guard for Resume from Deploy button |
| `saveCurrentRun()` | `void` | Serialise active state to `db-run-state` |
| `restoreRunState()` | `void` | On `ngOnInit`: restore completed or mark interrupted |
| `loadHistory()` | `void` | Read `db-run-history` from localStorage |
| `saveHistory()` | `void` | Write `db-run-history` to localStorage |
| `configure()` | `void` | Save PAT config from form; set `isConfigured = true` |
| `changePat()` | `void` | Reset `isConfigured = false` to show config card again |
| `reset()` | `void` | Clear all run state; remove `db-run-state` from localStorage |
| `overallStatus()` | `computed` | Derive overall status from `steps[]` statuses |

---

## 10. Services

### AuthService — `src/app/services/auth.service.ts`

Handles Firebase anonymous auth. Auto-signs in if no session exists.
Exposes `user$: Observable<User | null>` (backed by `ReplaySubject(1)`).

```typescript
// Typical component usage:
this.authService.user$
  .pipe(filter(user => !!user), take(1))
  .subscribe(user => {
    this.currentUserUid = user!.uid;
    // Safe to make Firestore calls now
  });
```

### ReservationService — `src/app/services/reservation.service.ts`

| Method | Description |
|--------|-------------|
| `getReservations$()` | Real-time stream, sorted by `startDate` |
| `addReservation(res)` | Adds a new document |
| `deleteReservation(id)` | Deletes by document ID |

### PipelineHistoryService — `src/app/services/pipeline-history.service.ts`

| Method | Description |
|--------|-------------|
| `getRuns$()` | Real-time stream, newest-first, capped at 50 records |
| `saveRun(record)` | Upserts the document (deep-clone before write to strip Angular proxies) |
| `deleteRun(id)` | Deletes by document ID |

### AzureDevOpsService — `src/app/services/azure-devops.service.ts`

All calls use `fetch` with `Authorization: Basic base64(:PAT)`. Config persisted in `localStorage`.

| Method | Description |
|--------|-------------|
| `configure(config)` | Sets PAT / org / project in memory |
| `persistConfig()` / `restoreConfig()` | localStorage read/write; `restoreConfig()` returns `true` if found |
| `createBranch(repo, relNum)` | Gets base branch SHA → POSTs new ref |
| `createPullRequest(repo, relNum)` | Opens PR from release branch to master |
| `checkBranchExists(repo, branch)` | Returns `true` if the branch ref exists |
| `findExistingPR(repo, srcBranch)` | Returns PR ID if an open PR exists for that source branch |
| `queueBuild(repo, branch)` | Finds build definition → queues a build → returns `buildId` |
| `waitForBuild(buildId, onProgress?)` | Polls every 5 s, max 60 min |
| `checkBuildStatus(buildId)` | Single snapshot: `{ done, success, status, result }` |
| `deploy(buildId, env, repo)` | Finds release definition → creates release with build artifact |
| `waitForDeployment(releaseId, env, onProgress?)` | Polls every 5 s, max 60 min |
| `checkDeploymentStatus(releaseId, env)` | Single snapshot: `{ done, success, statusName }` |

Base URLs:
- Builds: `https://dev.azure.com/vfuk-digital/Digital`
- Releases: `https://vsrm.dev.azure.com/vfuk-digital/Digital`

### RunPresenceService — `src/app/services/run-presence.service.ts`

| Method | Description |
|--------|-------------|
| `joinRun(runId)` | Writes presence doc; starts 20 s heartbeat; subscribes to snapshot |
| `leaveRun()` | Deletes presence doc; clears timers and listener |
| `viewers$` | Observable: other viewers seen within 60 s |

Viewer label = `"User " + uid.substring(0,4).toUpperCase()`.
Viewer colour = hash of UID modulo 12-colour palette.

---

## 11. Data Models

### Reservation

```typescript
interface Reservation {
  id: string;          // Firestore document ID
  userName: string;
  environment: string; // One of ENVIRONMENTS
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;     // "YYYY-MM-DD" (inclusive)
}
```

### Release Pipeline

```typescript
type StepStatus =
  | 'pending'           // Not yet started
  | 'running'           // Currently executing
  | 'success'           // Completed successfully
  | 'failed'            // Completed with error
  | 'skipped'           // Skipped (library services in deploy steps)
  | 'waiting-approval'  // Paused for manual approval (Step 5 gate)

interface ServiceStepResult {
  service: string;
  status: StepStatus;
  message?: string;
  prUrl?: string;              // PR link  (Step 2)
  buildId?: number;            // Build ID (Step 3)
  buildUrl?: string;           // Build results URL
  releaseId?: number;          // Release ID (Steps 4–5)
  releaseUrl?: string;         // Release environment logs URL
  releaseEnvironment?: string; // Resolved Azure stage name
  sourceBuildId?: number;      // Build artifact ID for deploy (used by Rerun)
  refreshing?: boolean;        // UI flag: Refresh in progress
  rerunning?: boolean;         // UI flag: Rerun in progress
}

interface PipelineStep {
  id: string;          // 'create-branch' | 'create-pr' | 'build-both'
                       // | 'deploy-master' | 'deploy-release'
  label: string;
  description: string;
  status: StepStatus;
  results: ServiceStepResult[];
}

interface PipelineRunRecord {
  id: string;               // UUID (assigned at startPipeline())
  releaseNumber: string;    // e.g. "24.3"
  environment: string;      // e.g. "dev1"
  services: string[];       // Selected microservice names
  status: 'running' | 'success' | 'failed';
  startedAt: string;        // ISO timestamp
  completedAt?: string;     // ISO timestamp — set by finalizeRunRecord()
  currentStepIndex: number; // 0-based
  steps: PipelineStep[];    // Full serialised step snapshot
  logs: string[];           // Activity log lines
  createdBy?: string;       // Firebase anonymous UID of the run owner
}
```

### Deploy Branch

All types are defined directly in `deploy-branch.component.ts`.

```typescript
// Status type shared by both the step tracker and individual task items
type TaskStatus =
  | 'pending'    // Not yet started
  | 'running'    // Currently executing
  | 'success'    // Completed successfully
  | 'failed'     // Completed with error
  | 'skipped'    // Skipped (unused but supported)
  | 'warning'    // Finished with non-blocking issues

// One service × build job
interface ServiceTask {
  service: string;
  status: TaskStatus;
  message: string;
  buildId?: number;
  buildUrl?: string;
}

// One environment row in the deploy card
interface EnvTask {
  env: string;
  status: TaskStatus;
  message: string;
  deployments: DeployTask[];
}

// One service × environment deployment
interface DeployTask {
  service: string;
  env: string;
  status: TaskStatus;
  message: string;
  releaseId?: number;
  releaseUrl?: string;
}

// One entry in the step tracker sidebar
interface DeployStep {
  id: string;       // 'pat' | 'branch' | 'env' | 'build' | 'deploy'
  label: string;
  description: string;
  status: TaskStatus;
}

// One entry in the run history list (persisted to localStorage)
interface DeployHistoryEntry {
  id: string;                      // UUID generated at start of run
  branch: string;
  services: string[];
  environments: string[];
  startedAt: string;               // ISO timestamp
  finishedAt: string;              // ISO timestamp
  overallStatus: 'success' | 'failed' | 'interrupted';
  logs: string[];
  steps: DeployStep[];
  patResult: TaskStatus;
  branchTasks: ServiceTask[];
  buildTasks: ServiceTask[];
  deployTasks: EnvTask[];
  envReservationTasks: ServiceTask[];
}

// Shape of db-run-state in localStorage
interface DeployRunState {
  isRunning: boolean;
  isComplete: boolean;
  runId: string;
  runStartedAt: string;
  branch: string;
  selectedServices: string[];
  selectedEnvironments: string[];
  pat: string;
  organization: string;
  project: string;
  patResult: TaskStatus;
  branchTasks: ServiceTask[];
  envReservationTasks: ServiceTask[];
  buildTasks: ServiceTask[];
  deployTasks: EnvTask[];
  steps: DeployStep[];
  logs: string[];
}
```

**localStorage keys used by Deploy Branch:**

| Key | Content | Cleared |
|-----|---------|---------|
| `azure-devops-config` | `{ pat, organization, project }` — shared with CI/CD Pipeline tab | Never (until Change PAT) |
| `db-run-state` | Full active run state (`DeployRunState`) | On `reset()` / start of new run |
| `db-run-history` | `DeployHistoryEntry[]` — up to 20 entries | Never (oldest entry pruned at 21) |

---

## 12. Firebase Collections

### `reservations`

| Field | Type | Notes |
|-------|------|-------|
| `userName` | string | |
| `environment` | string | One of `ENVIRONMENTS` |
| `startDate` | string | `"YYYY-MM-DD"` |
| `endDate` | string | `"YYYY-MM-DD"` |

### `pipeline-runs`

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Also the document ID |
| `releaseNumber` | string | e.g. `"24.3"` |
| `environment` | string | |
| `services` | string[] | |
| `status` | string | `running` / `success` / `failed` |
| `startedAt` | string | ISO timestamp |
| `completedAt` | string? | ISO timestamp |
| `currentStepIndex` | number | |
| `steps` | PipelineStep[] | Full serialised snapshot |
| `logs` | string[] | |
| `createdBy` | string? | Firebase UID of run owner |

### `pipeline-runs/{runId}/viewers`  _(subcollection)_

| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | Also the document ID |
| `label` | string | `"User XXXX"` |
| `color` | string | Hex colour |
| `joinedAt` | string | ISO timestamp |
| `lastSeen` | string | Updated every 20 s (heartbeat) |

---

## 13. Azure DevOps API Reference

Organisation: `vfuk-digital` · Project: `Digital`

| Operation | Method | Endpoint |
|-----------|--------|---------|
| Get branch ref | GET | `dev.azure.com/{org}/{proj}/_apis/git/repositories/{repo}/refs?filter=heads/{branch}&api-version=7.1` |
| Create branch | POST | `dev.azure.com/{org}/{proj}/_apis/git/repositories/{repo}/refs?api-version=7.1` |
| Create PR | POST | `dev.azure.com/{org}/{proj}/_apis/git/repositories/{repo}/pullrequests?api-version=7.1` |
| Get PRs | GET | `dev.azure.com/{org}/{proj}/_apis/git/repositories/{repo}/pullrequests?api-version=7.1` |
| Resolve repo GUID | GET | `dev.azure.com/{org}/{proj}/_apis/git/repositories/{repo}?api-version=7.1` |
| Find build definitions | GET | `dev.azure.com/{org}/{proj}/_apis/build/definitions?repositoryId={guid}&repositoryType=TfsGit&api-version=7.1` |
| Queue build | POST | `dev.azure.com/{org}/{proj}/_apis/build/builds?api-version=7.1` |
| Get build | GET | `dev.azure.com/{org}/{proj}/_apis/build/builds/{id}?api-version=7.1` |
| Find release definitions | GET | `vsrm.dev.azure.com/{org}/{proj}/_apis/release/definitions?searchText={repo}&api-version=7.1` |
| Create release | POST | `vsrm.dev.azure.com/{org}/{proj}/_apis/release/releases?api-version=7.1` |
| Get release | GET | `vsrm.dev.azure.com/{org}/{proj}/_apis/release/releases/{id}?api-version=7.1` |

All requests: `Authorization: Basic base64(:PAT)` · `Content-Type: application/json`

---

## 14. Known Behaviors & Edge Cases

**Branch already exists** — `createBranch()` fails. Delete the branch in Azure DevOps before retrying or skip Step 1 if branches are already correct.

**Rerun deploys always use the latest build** — `rerunResult()` for a deploy step first scans Step 3 results for the latest successful build for that service variant (`master` / `release`), and only falls back to `sourceBuildId` if no match is found. This ensures deploys always reference the most recent build.

**PAT expiry** — Azure DevOps PATs expire on a schedule set in Azure DevOps. If calls return `401 Unauthorized`, click **Change PAT** in the sidebar and enter a fresh token.

**CSS budget warning** — `cicd-pipeline.component.css` (~18.7 KB) exceeds Angular's 16 KB style budget warning threshold. Non-blocking — the build succeeds and the app works correctly.

**Library services in deploy steps** — show `status: skipped` with message "Library — no deployment needed" in Steps 4 and 5. They are still built in Step 3 (both release and master builds proceed normally).

**Multiple `running` records** — in the rare case of a Firestore inconsistency, `hasOtherUserRunning()` flags the first non-owned running record it finds. Use the Run History delete button to clean up stale records.

**Only one active pipeline at a time** — this is enforced client-side only (via Firestore record status checks), not server-side. Users could bypass it by clearing `localStorage`. For internal team use this is acceptable.

**Deploy Branch: interrupted run detection** — on `ngOnInit`, if `db-run-state.isRunning === true`, the component assumes the page was refreshed mid-run and sets `wasInterrupted = true`. It does not attempt to auto-resume — the user selects Resume or Rerun from the banner.

**Deploy Branch: smart resume vs re-queue** — `resumeFromBuild()` calls `waitForBuild(existingBuildId)` to re-attach to the already-queued build. No new build is queued. This avoids wasting build minutes if the build was already 90% complete when the page was refreshed.

**Deploy Branch: history capped at 20** — when a run finishes (or is interrupted) it is prepended to `db-run-history`. If the array exceeds 20 entries the oldest entry is removed. History is never synced to Firebase; it is local to the browser.

**Deploy Branch: no Firebase** — the entire Deploy Branch feature uses only `localStorage`. There is no Firestore integration, no anonymous auth requirement, and no multi-user safety checks. Two users can run the Deploy Branch pipeline simultaneously with no conflict detection.

**Deploy Branch: rerun from history** — `rerunAllFromHistory(run)` and `rerunBuildFromHistory(run)` pre-populate `branchName`, `selectedServices`, and `selectedEnvironments` from the history entry before calling `run()` / `rerunBuildStep()`. The PAT and config come from the currently stored `azure-devops-config`.

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "Failed to get release/develop ref" | Base branch doesn't exist in the repo | Create `release/develop` in Azure DevOps |
| "No release definition found for {repo}" | No release pipeline configured for that repo | Create a release definition in Azure DevOps |
| Deploy step stuck in inProgress | Azure deployment stalled | Click **Refresh All** — the actual status is fetched and the pipeline auto-continues if resolved |
| "Cannot rerun: no build ID found" | Rerunning a deploy but Step 3 has no successful builds | Rerun Step 3 (Build) first |
| Approval button disabled | You are not the run creator | Only the user who started the run can approve (`createdBy` field) |
| "Another user is running" warning | Another Firestore record has `status: running` | Wait for it to finish, or ask them to stop it |
| "Anonymous sign-in failed" | Firebase Anonymous Auth is not enabled | Enable it in Firebase Console → Authentication → Sign-in method |
| Firestore permission denied | Security rules block anonymous users | Update rules: `allow read, write: if request.auth != null` |
| Build queued on wrong branch | Release number was empty when rerunning from history | Fixed: `getActiveRunCtx()` reads `releaseNumber` from the Firestore run record |
| **Deploy Branch** | | |
| PAT config card keeps showing | `azure-devops-config` key is absent or malformed | Delete the key from DevTools → Application → Local Storage and re-enter PAT |
| Interrupted banner after every refresh | A previous run crashed without completing | Click Rerun or use ← New Deploy to clear state; or manually delete `db-run-state` from localStorage |
| "Resume from Build" button is disabled | No build IDs were saved before refresh | The builds had not started yet — use Rerun from scratch |
| History shows wrong run results | Clicked a history row which replaced the active view | Use the chevron ▸ button to expand inline without replacing the active run view |
| History entry missing | Run was started but browser tab was closed before completion | Run must reach the "finalise" call to be saved to history; interrupted runs are only saved if the `wasInterrupted` path completes |
| Deploy Branch logs are empty after restore | LocalStorage was cleared externally | history and state are stored only in the browser; clearing storage loses all Deploy Branch history |
