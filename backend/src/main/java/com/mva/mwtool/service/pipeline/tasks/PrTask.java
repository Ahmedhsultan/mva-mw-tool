package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.RepoFileDto;
import com.mva.mwtool.enums.TaskStatus;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class PrTask extends Task {
    private String fromBranch;
    private String targetBranch;
    private String repoName;
    private String prLink;
    private boolean executed;
    private transient Object prResult;

    public PrTask() {}

    @Override
    protected void execute() {
        // PR creation uses the repo service
        RepoFileDto result = devOpsContext.getRepoService()
                .pullFile(repoName, "", fromBranch);
        this.prResult = result;
        this.executed = result != null;
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
