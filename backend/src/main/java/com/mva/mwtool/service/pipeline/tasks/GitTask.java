package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.enums.TaskStatus;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class GitTask extends Task {
    private String repoName;
    private String branch;
    private String sourceBranch;
    private boolean executed;

    public GitTask() {}

    @Override
    protected void execute() {
        devOpsContext.getRepoService()
                .createBranch(repoName, branch, sourceBranch);
        this.executed = true;
    }

    @Override
    public boolean stop() {
        return false;
    }

    @Override
    public void reTryRun() {
        this.executed = false;
        execute();
    }

    @Override
    public TaskStatus getStatus() {
        if (executionFailed) {
            return TaskStatus.FAILED;
        }
        return executed ? TaskStatus.SUCCEEDED : TaskStatus.PENDING;
    }
}
