package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.BuildDto;
import com.mva.mwtool.enums.TaskStatus;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class BuildTask extends Task {
    private String branch;
    private String repoName;
    private String definitionId;
    private String buildLink;
    private transient BuildDto buildResult;

    public BuildTask() {}

    @Override
    protected void execute() {
        BuildDto build = devOpsContext.getBuildService().createBuild(branch, repoName, definitionId);
        this.buildResult = build;
        this.buildLink = build.getUrl();
    }

    @Override
    public boolean stop() {
        if (buildResult != null && buildResult.getId() != null) {
            devOpsContext.getBuildService().cancelBuild(buildResult.getId());
            return true;
        }
        return false;
    }

    @Override
    public void reTryRun() {
        execute();
    }

    @Override
    public TaskStatus getStatus() {
        if (executionFailed) {
            return TaskStatus.FAILED;
        }
        if (buildResult == null || buildResult.getId() == null) {
            return TaskStatus.PENDING;
        }
        // Query the platform for current status
        BuildDto current = devOpsContext.getBuildService().getBuildById(buildResult.getId());
        this.buildResult = current;

        String status = current.getStatus();
        String result = current.getResult();

        if ("completed".equalsIgnoreCase(status)) {
            if ("succeeded".equalsIgnoreCase(result) || "partiallySucceeded".equalsIgnoreCase(result)) {
                return TaskStatus.SUCCEEDED;
            }
            return TaskStatus.FAILED;
        } else if ("cancelling".equalsIgnoreCase(status) || "cancelled".equalsIgnoreCase(status)) {
            return TaskStatus.CANCELLED;
        } else if ("inProgress".equalsIgnoreCase(status) || "queued".equalsIgnoreCase(status)) {
            return TaskStatus.RUNNING;
        }
        return TaskStatus.PENDING;
    }
}
