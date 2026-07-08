# Pipeline Backend

## Checklist
- [x] Document the current pipeline backend architecture
- [x] Document the REST API endpoints
- [x] Document the expected pipeline JSON payload for `create pipeline`
- [x] Document the credentials JSON payload for `run pipeline`
- [x] Document every supported task type and its required configuration
- [x] Explain graph behavior, conditions, statuses, and runtime resolution
- [x] Provide a frontend prompt for building a canvas-based pipeline editor

---

## 1) Overview

This backend stores and runs **graph-based pipelines**.

A pipeline is **not** a nested tree anymore.
It is a **flat task list** with references between tasks using `nextTaskIds`.
At runtime, the backend builds a `PipelineGraph` that resolves:

- child links (`nextTasks`)
- parent links (`previousTasks`)
- task lookup by id
- provider-specific DevOps context per task

This design supports:

- one task having multiple children
- one task being referenced by multiple parents
- shared downstream tasks
- runtime lookup between tasks, such as `DeploymentTask` resolving `buildTaskId` to a real build run id

---

## 2) Current backend architecture

### Main flow

1. Frontend sends a pipeline JSON structure to create a pipeline.
2. Backend stores the JSON as-is in memory via `PipelinesRepo`.
3. Frontend sends credentials to run a pipeline.
4. Backend builds a `PipelineGraph` from the stored JSON.
5. Backend injects a `DevOpsContext` into each task.
6. Backend starts the **root tasks** (tasks with no parents).
7. Task status is queried later through the task status endpoint.

### Important note about current execution behavior

The current code starts **root tasks only**.
`Task.run()` checks conditions and executes the task itself.
It does **not currently traverse and auto-run downstream tasks** after a task succeeds.

So the graph model is in place, but full orchestration / scheduling of downstream tasks still needs to be expanded if you want automatic pipeline progression.

---

## 3) Key backend components

### `PipelineController`
File: `src/main/java/com/mva/mwtool/controller/PipelineController.java`

Exposes pipeline endpoints.

### `PipelineService`
File: `src/main/java/com/mva/mwtool/service/PipelineService.java`

Responsibilities:
- create pipelines
- run pipelines
- list pipelines and runs
- query task status

### `PipelineGraph`
File: `src/main/java/com/mva/mwtool/service/pipeline/PipelineGraph.java`

Responsibilities:
- build a map of tasks by id
- resolve `nextTaskIds` into object references
- populate `previousTasks`
- inject graph reference into each task
- identify root tasks

### `TaskGraphBuilder`
File: `src/main/java/com/mva/mwtool/service/pipeline/util/TaskGraphBuilder.java`

Responsibilities:
- deserialize each task node into the correct task class
- inject provider-specific `DevOpsContext`
- return a `PipelineGraph`

### `Task`
File: `src/main/java/com/mva/mwtool/service/pipeline/tasks/Task.java`

Base class for all tasks.

Common fields:
- `id`
- `taskType`
- `conditions`
- `devOpsProvider`
- `nextTaskIds`

Resolved runtime fields:
- `nextTasks`
- `previousTasks`
- `devOpsContext`
- `pipelineGraph`

### `DevOpsServiceFactory`
File: `src/main/java/com/mva/mwtool/devops/DevOpsServiceFactory.java`

Creates a fresh provider-specific `DevOpsContext` using:
- provider (`azure` or `github`)
- `DevOpsCredentials`

### `DevOpsContext`
File: `src/main/java/com/mva/mwtool/devops/DevOpsContext.java`

Contains:
- `provider`
- `credentials`
- `authService`
- `buildService`
- `deployService`
- `repoService`

---

## 4) Supported endpoints

### Create pipeline

`POST /api/pipelines?pipelineName={name}`

Body: pipeline graph JSON

### Get all pipelines

`GET /api/pipelines`

### Run pipeline

`POST /api/pipelines/{pipelineName}/run`

Body: `DevOpsCredentials`

### Get all runs

`GET /api/pipelines/runs`

### Get task status

`GET /api/pipelines/runs/{pipelineRunName}/tasks/{taskId}/status`

Returns `TaskStatus` enum value.

### Stop pipeline run

`POST /api/pipelines/runs/{pipelineRunName}/stop`

> Current implementation stub exists, but full stop orchestration is not implemented yet.

---

## 5) Task status enum

File: `src/main/java/com/mva/mwtool/enums/TaskStatus.java`

Supported statuses:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`
- `WAITING_APPROVAL`
- `SKIPPED`
- `RETRYING`

---

## 6) Condition model

File: `src/main/java/com/mva/mwtool/dto/Condition.java`

A condition currently looks like:

```json
{
  "taskId": "build-1",
  "status": "SUCCEEDED"
}
```

Meaning:
- the current task is allowed to run only if task `build-1` currently reports `SUCCEEDED`

Condition comparison is done against:

```java
previousTask.getStatus().name()
```

So frontend should always send status values matching the enum names exactly, for example:
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`
- `WAITING_APPROVAL`

---

## 7) Expected JSON structure for creating a pipeline

## Root object

The backend currently expects the pipeline structure to contain:

```json
{
  "tasks": [ ... ]
}
```

Each item in `tasks` is one task node in the graph.

---

## 8) Most expected frontend payload for `create pipeline`

### Recommended example

```json
{
  "tasks": [
    {
      "id": "build-1",
      "taskType": "BuildTask",
      "devOpsServiceFactory": "azure",
      "branch": "refs/heads/main",
      "repoName": "my-repo",
      "definitionId": "12",
      "conditions": [],
      "nextTaskIds": ["approval-1", "pr-1"]
    },
    {
      "id": "approval-1",
      "taskType": "ApprovalTask",
      "devOpsServiceFactory": "azure",
      "approved": false,
      "conditions": [
        {
          "taskId": "build-1",
          "status": "SUCCEEDED"
        }
      ],
      "nextTaskIds": ["deploy-1"]
    },
    {
      "id": "pr-1",
      "taskType": "PrTask",
      "devOpsServiceFactory": "github",
      "fromBranch": "feature/x",
      "targetBranch": "main",
      "repoName": "my-repo",
      "conditions": [
        {
          "taskId": "build-1",
          "status": "SUCCEEDED"
        }
      ],
      "nextTaskIds": []
    },
    {
      "id": "deploy-1",
      "taskType": "DeploymentTask",
      "devOpsServiceFactory": "azure",
      "buildTaskId": "build-1",
      "repoName": "my-repo",
      "definitionId": "7",
      "environment": "production",
      "description": "Deploy approved build to production",
      "conditions": [
        {
          "taskId": "approval-1",
          "status": "SUCCEEDED"
        }
      ],
      "nextTaskIds": []
    }
  ]
}
```

---

## 9) Task types and expected configuration

### 9.1 `BuildTask`

Purpose:
- trigger a build pipeline on the selected provider

Fields:

```json
{
  "id": "build-1",
  "taskType": "BuildTask",
  "devOpsServiceFactory": "azure",
  "branch": "refs/heads/main",
  "repoName": "my-repo",
  "definitionId": "12",
  "conditions": [],
  "nextTaskIds": ["..."]
}
```

Required frontend fields:
- `id`
- `taskType = BuildTask`
- `devOpsServiceFactory`
- `branch`
- `repoName`
- `definitionId`
- `nextTaskIds`

Notes:
- `definitionId` is the build/workflow definition identifier on the target platform
- the backend stores the platform response in `buildResult`
- `getStatus()` queries the DevOps platform using the created build id
- `stop()` cancels the build on the platform

---

### 9.2 `DeploymentTask`

Purpose:
- trigger a deployment using the build output from a referenced build task

Fields:

```json
{
  "id": "deploy-1",
  "taskType": "DeploymentTask",
  "devOpsServiceFactory": "azure",
  "buildTaskId": "build-1",
  "repoName": "my-repo",
  "definitionId": "7",
  "environment": "production",
  "description": "Deploy approved build",
  "conditions": [
    {
      "taskId": "approval-1",
      "status": "SUCCEEDED"
    }
  ],
  "nextTaskIds": []
}
```

Required frontend fields:
- `id`
- `taskType = DeploymentTask`
- `devOpsServiceFactory`
- `buildTaskId`
- `definitionId`
- `environment`
- `nextTaskIds`

Optional:
- `repoName`
- `description`

Notes:
- `buildTaskId` must reference an existing `BuildTask` node id
- at runtime, backend looks up the build task in `PipelineGraph`
- then it reads the real platform build id from that task’s `buildResult`
- `getStatus()` queries the deployment platform
- deployment cancellation is not implemented currently

---

### 9.3 `ApprovalTask`

Purpose:
- represent a manual approval gate

Fields:

```json
{
  "id": "approval-1",
  "taskType": "ApprovalTask",
  "devOpsServiceFactory": "azure",
  "approved": false,
  "conditions": [
    {
      "taskId": "build-1",
      "status": "SUCCEEDED"
    }
  ],
  "nextTaskIds": ["deploy-1"]
}
```

Notes:
- current status is:
  - `WAITING_APPROVAL` when not approved
  - `SUCCEEDED` when approved
- this task is a logical/manual gate, not a real platform operation

---

### 9.4 `GitTask`

Purpose:
- push content to a repository file

Fields:

```json
{
  "id": "git-1",
  "taskType": "GitTask",
  "devOpsServiceFactory": "github",
  "repoName": "my-repo",
  "branch": "main",
  "filePath": "/path/to/file.txt",
  "content": "new file content",
  "commitMessage": "update file",
  "conditions": [],
  "nextTaskIds": []
}
```

Notes:
- current implementation is synchronous
- `getStatus()` returns `SUCCEEDED` once executed
- `stop()` is not supported

---

### 9.5 `PrTask`

Purpose:
- intended to represent a pull request task

Fields:

```json
{
  "id": "pr-1",
  "taskType": "PrTask",
  "devOpsServiceFactory": "github",
  "fromBranch": "feature/x",
  "targetBranch": "main",
  "repoName": "my-repo",
  "conditions": [],
  "nextTaskIds": []
}
```

Important current note:
- current implementation is still placeholder-like
- it uses repo service interaction and does **not yet create a full PR workflow**
- frontend can still model it, but backend behavior may need enhancement later

---

## 10) Credentials payload for `run pipeline`

When frontend starts a pipeline, it should call:

`POST /api/pipelines/{pipelineName}/run`

with body like:

```json
{
  "azure": {
    "pat": "AZURE_PAT",
    "organization": "my-azure-org",
    "project": "my-azure-project"
  },
  "github": {
    "pat": "GITHUB_PAT",
    "organization": "my-github-org",
    "project": "my-github-repo"
  }
}
```

Notes:
- You can send both blocks if the graph mixes Azure and GitHub tasks.
- If a pipeline only uses one provider, frontend may send only the relevant block.
- The backend resolves the correct provider per task via `devOpsServiceFactory` field in the task JSON.

---

## 11) Current graph behavior

### Parent/child resolution

Frontend sends only:
- `nextTaskIds`

Backend derives:
- `nextTasks`
- `previousTasks`

This means frontend should **not** send object references or nested child objects.
Only send ids.

### Root tasks

A root task is any task that has no incoming edge.
The backend computes roots automatically.

### Shared nodes

Because the graph is flat and linked by ids, this is valid:

```json
{
  "tasks": [
    {
      "id": "build-1",
      "taskType": "BuildTask",
      "devOpsServiceFactory": "azure",
      "branch": "refs/heads/main",
      "repoName": "repo-a",
      "definitionId": "1",
      "conditions": [],
      "nextTaskIds": ["deploy-1"]
    },
    {
      "id": "approval-1",
      "taskType": "ApprovalTask",
      "devOpsServiceFactory": "azure",
      "approved": false,
      "conditions": [],
      "nextTaskIds": ["deploy-1"]
    },
    {
      "id": "deploy-1",
      "taskType": "DeploymentTask",
      "devOpsServiceFactory": "azure",
      "buildTaskId": "build-1",
      "definitionId": "2",
      "environment": "prod",
      "conditions": [
        { "taskId": "build-1", "status": "SUCCEEDED" },
        { "taskId": "approval-1", "status": "SUCCEEDED" }
      ],
      "nextTaskIds": []
    }
  ]
}
```

This gives one shared deployment node with two parents.

---

## 12) Current limitations / practical backend notes

These are important for frontend expectations.

### 12.1 Downstream auto-execution is not fully orchestrated yet
The current service runs root tasks, but full graph scheduling of downstream tasks after parent completion is not fully implemented.

### 12.2 `PrTask` is not a full PR creator yet
The current implementation behaves more like a placeholder task using repo operations.

### 12.3 Deployment stop is not implemented
`DeploymentTask.stop()` currently returns `false`.

### 12.4 Git task status is local
`GitTask` uses a synchronous status model and does not poll the platform.

### 12.5 Field naming
The JSON provider field currently used by backend is:

```json
"devOpsServiceFactory": "azure"
```

This name is technically working, but semantically it behaves like:

```json
"devOpsProvider": "azure"
```

If you later want cleaner naming, backend and frontend can be refactored together.

---

## 13) Example requests

### Create a pipeline

```bash
curl -X POST "http://localhost:8080/api/pipelines?pipelineName=sample-pipeline" \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "build-1",
        "taskType": "BuildTask",
        "devOpsServiceFactory": "azure",
        "branch": "refs/heads/main",
        "repoName": "my-repo",
        "definitionId": "12",
        "conditions": [],
        "nextTaskIds": ["deploy-1"]
      },
      {
        "id": "deploy-1",
        "taskType": "DeploymentTask",
        "devOpsServiceFactory": "azure",
        "buildTaskId": "build-1",
        "definitionId": "7",
        "environment": "production",
        "description": "Deploy last build",
        "conditions": [
          { "taskId": "build-1", "status": "SUCCEEDED" }
        ],
        "nextTaskIds": []
      }
    ]
  }'
```

### Run a pipeline

```bash
curl -X POST "http://localhost:8080/api/pipelines/sample-pipeline/run" \
  -H "Content-Type: application/json" \
  -d '{
    "azure": {
      "pat": "YOUR_PAT",
      "organization": "your-org",
      "project": "your-project"
    }
  }'
```

### Get task status

```bash
curl "http://localhost:8080/api/pipelines/runs/{pipelineRunName}/tasks/{taskId}/status"
```

---

## 14) Frontend prompt for building the canvas editor

Use the following prompt for the frontend team or for an AI frontend generator.

### Prompt

Build a pipeline editor UI for a graph-based DevOps workflow system.

Requirements:

1. Create a full-screen page split into:
   - a **left sidebar/toolbox**
   - a **center canvas/graph editor**
   - a **right configuration panel** for the selected task

2. In the **left toolbox**, show draggable task types:
   - BuildTask
   - DeploymentTask
   - ApprovalTask
   - GitTask
   - PrTask

3. In the **center canvas**:
   - allow drag-and-drop of task nodes from the left toolbox
   - allow connecting nodes visually with edges
   - allow multiple incoming and outgoing edges
   - support shared children and multiple parents
   - support node selection, deletion, and repositioning
   - generate unique task ids automatically

4. In the **right configuration panel**, show a dynamic form based on the selected task type.

5. Required task configuration fields:

   BuildTask:
   - id
   - devOpsServiceFactory (azure | github)
   - branch
   - repoName
   - definitionId
   - conditions

   DeploymentTask:
   - id
   - devOpsServiceFactory (azure | github)
   - buildTaskId (select from BuildTask nodes)
   - repoName
   - definitionId
   - environment
   - description
   - conditions

   ApprovalTask:
   - id
   - devOpsServiceFactory
   - approved
   - conditions

   GitTask:
   - id
   - devOpsServiceFactory
   - repoName
   - branch
   - filePath
   - content
   - commitMessage
   - conditions

   PrTask:
   - id
   - devOpsServiceFactory
   - fromBranch
   - targetBranch
   - repoName
   - conditions

6. Edge behavior:
   - edges define `nextTaskIds`
   - when exporting, convert outgoing edges of each node into the node’s `nextTaskIds` array
   - do not nest tasks inside each other
   - export a **flat graph** structure

7. Condition editor:
   - allow the user to add conditions per task
   - each condition should select:
     - a task id from existing nodes
     - a required status from:
       - PENDING
       - RUNNING
       - SUCCEEDED
       - FAILED
       - CANCELLED
       - WAITING_APPROVAL
       - SKIPPED
       - RETRYING

8. Validation rules before save:
   - every node must have a unique `id`
   - `taskType` is required
   - `devOpsServiceFactory` is required
   - `DeploymentTask.buildTaskId` must reference an existing BuildTask node
   - no edge should reference a non-existing task
   - graph should have at least one root node
   - show warnings for isolated nodes

9. Export payload format exactly as:

```json
{
  "tasks": [
    {
      "id": "node-id",
      "taskType": "BuildTask",
      "devOpsServiceFactory": "azure",
      "branch": "refs/heads/main",
      "repoName": "repo",
      "definitionId": "12",
      "conditions": [],
      "nextTaskIds": ["next-node-id"]
    }
  ]
}
```

10. Also provide a Run Pipeline form that lets the user enter credentials:
    - Azure PAT / organization / project
    - GitHub PAT / organization / project

11. Use a graph library such as React Flow or an equivalent canvas graph editor.

12. The UI should feel like a visual workflow builder similar to CI/CD pipeline editors.

---

## 15) Recommended frontend model

Recommended frontend internal state shape:

```ts
interface PipelineTaskNode {
  id: string;
  taskType: "BuildTask" | "DeploymentTask" | "ApprovalTask" | "GitTask" | "PrTask";
  devOpsServiceFactory: "azure" | "github";
  nextTaskIds: string[];
  conditions: Array<{
    taskId: string;
    status: string;
  }>;
  [key: string]: any;
}

interface PipelinePayload {
  tasks: PipelineTaskNode[];
}
```

---

## 16) Recommended next backend improvements

If you continue backend development, the most useful next steps are:

1. Add real downstream task orchestration after parent success.
2. Add stop/cancel support for deployments if the provider supports it.
3. Implement a real PR service for `PrTask`.
4. Rename JSON field `devOpsServiceFactory` to `devOpsProvider` for clarity.
5. Add DTO validation for pipeline creation requests.
6. Persist pipelines/runs in a database instead of in-memory repositories.
7. Add cycle detection to reject invalid graphs.
8. Add task execution history and timestamps.

---

## 17) Summary for frontend

The frontend should think of the pipeline as:

- a **graph**, not a tree
- nodes = tasks
- edges = `nextTaskIds`
- conditions = explicit task-id + status dependencies
- provider = per-task field
- credentials = provided only when running the pipeline

The most important payload shape to send to backend for pipeline creation is:

```json
{
  "tasks": [
    {
      "id": "unique-task-id",
      "taskType": "BuildTask",
      "devOpsServiceFactory": "azure",
      "conditions": [],
      "nextTaskIds": []
    }
  ]
}
```

