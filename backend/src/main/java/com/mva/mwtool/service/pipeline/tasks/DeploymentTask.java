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
    public TaskStatus getStatus() {
        if (deployResult == null || deployResult.getId() == null) {
            return TaskStatus.PENDING;
        }
        DeployDto current = devOpsContext.getDeployService().getDeployById(deployResult.getId());
        this.deployResult = current;

        String status = current.getStatus();
        if ("succeeded".equalsIgnoreCase(status)) {
            return TaskStatus.SUCCEEDED;
        } else if ("failed".equalsIgnoreCase(status) || "rejected".equalsIgnoreCase(status)) {
            return TaskStatus.FAILED;
        } else if ("cancelled".equalsIgnoreCase(status)) {
            return TaskStatus.CANCELLED;
        } else if ("inProgress".equalsIgnoreCase(status) || "queued".equalsIgnoreCase(status)) {
            return TaskStatus.RUNNING;
        }
        return TaskStatus.PENDING;
    }
}
