package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.enums.GitAction;
import com.mva.mwtool.enums.TaskStatus;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class GitTask extends Task {
    private GitAction gitAction = GitAction.PUSH_FILE;
    private String repoName;
    private String branch;
    private String sourceBranch;
    private String filePath;
    private String content;
    private String commitMessage;
    private boolean executed;

    public GitTask() {}

    @Override
    protected void execute() {
        switch (gitAction) {
            case CREATE_BRANCH -> {
                devOpsContext.getRepoService()
                        .createBranch(repoName, branch, sourceBranch);
            }
            case PUSH_FILE -> {
                devOpsContext.getRepoService()
                        .pushFile(repoName, filePath, branch, content, commitMessage);
            }
        }
        this.executed = true;
    }

    @Override
    public boolean stop() {
        // Git push is atomic — can't be stopped
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
        // Git push is synchronous — if executed, it succeeded
        return executed ? TaskStatus.SUCCEEDED : TaskStatus.PENDING;
    }
}
