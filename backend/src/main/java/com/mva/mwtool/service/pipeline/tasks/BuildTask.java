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
    /** NEW triggers a fresh build; LATEST reuses the most recent successful build for the branch. */
    private String buildMode = MODE_NEW;
    private String buildLink;
    private transient BuildDto buildResult;

    public static final String MODE_NEW = "NEW";
    public static final String MODE_LATEST = "LATEST";

    public BuildTask() {}

    private boolean isReuseLatest() {
        return MODE_LATEST.equalsIgnoreCase(buildMode);
    }

    @Override
    protected void execute() {
        BuildDto build;
        if (isReuseLatest()) {
            build = devOpsContext.getBuildService().getLatestSuccessfulBuild(branch, repoName, definitionId);
            if (build == null || build.getId() == null || build.getId().isBlank()) {
                throw new IllegalStateException("No successful build found for branch '" + branch
                        + "' and definition '" + definitionId + "' to reuse.");
            }
        } else {
            build = devOpsContext.getBuildService().createBuild(branch, repoName, definitionId);
        }
        this.buildResult = build;
        this.buildLink = build.getUrl();
    }

    @Override
    public boolean stop() {
        if (isReuseLatest()) {
            return false;
        }
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
    protected TaskStatus computeStatus() {
        if (executionFailed) {
            return TaskStatus.FAILED;
        }
        if (buildResult == null || buildResult.getId() == null) {
            return TaskStatus.PENDING;
        }
        if (isReuseLatest()) {
            // Only successful builds are selected for reuse, so no polling is needed.
            return TaskStatus.SUCCEEDED;
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
