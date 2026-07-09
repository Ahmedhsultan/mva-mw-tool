package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.PrDto;
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
    private transient PrDto prResult;

    public PrTask() {}

    @Override
    protected void execute() {
        PrDto result = devOpsContext.getRepoService()
                .createPullRequest(repoName, fromBranch, targetBranch,
                        fromBranch + " → " + targetBranch, null);
        this.prResult = result;
        this.prLink = result.getUrl();
        this.executed = result.getId() != null;
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
    protected TaskStatus computeStatus() {
        if (executionFailed) {
            return TaskStatus.FAILED;
        }
        return executed ? TaskStatus.SUCCEEDED : TaskStatus.PENDING;
    }
}
