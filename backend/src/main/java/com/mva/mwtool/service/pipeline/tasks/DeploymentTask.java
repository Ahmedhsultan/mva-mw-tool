package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.DeployDto;
import com.mva.mwtool.enums.TaskStatus;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class DeploymentTask extends Task {
    private String buildTaskId;
    private String repoName;
    private String definitionId;
    private String environment;
    private String description;
    private String deploymentLink;
    private transient DeployDto deployResult;

    public DeploymentTask() {}

    @Override
    protected void execute() {
        // Look up the build task to get the actual build ID
        Task buildTask = pipelineGraph.getTaskById(buildTaskId);
        if (buildTask == null || !(buildTask instanceof BuildTask)) {
            throw new IllegalStateException("Build task not found: " + buildTaskId);
        }
        String resolvedBuildId = ((BuildTask) buildTask).getBuildResult().getId();

        DeployDto deploy = devOpsContext.getDeployService()
                .createDeploy(resolvedBuildId, definitionId, environment, description);
        this.deployResult = deploy;
        this.deploymentLink = deploy.getUrl();
    }

    @Override
    public boolean stop() {
        // Deployments typically can't be cancelled mid-flight
        return false;
    }

    @Override
    public void reTryRun() {
        execute();
    }

    @Override
    protected TaskStatus computeStatus() {
        if (executionFailed) {
            return TaskStatus.FAILED;
        }
        if (deployResult == null || deployResult.getId() == null) {
            return TaskStatus.PENDING;
        }
        DeployDto current = devOpsContext.getDeployService().getDeployById(deployResult.getId(), this.environment);
        this.deployResult = current;

        String status = current.getStatus();
        if (status == null) return TaskStatus.PENDING;

        switch (status.toLowerCase()) {
            case "succeeded":
            case "partiallysucceeded":
                return TaskStatus.SUCCEEDED;
            case "failed":
            case "rejected":
                return TaskStatus.FAILED;
            case "cancelled":
            case "canceled":
                return TaskStatus.CANCELLED;
            case "inprogress":
            case "queued":
                return TaskStatus.RUNNING;
            case "pending":
            case "scheduled":
            case "notstarted":
            case "undefined":
                return TaskStatus.PENDING;
            default:
                return TaskStatus.PENDING;
        }
    }
}
