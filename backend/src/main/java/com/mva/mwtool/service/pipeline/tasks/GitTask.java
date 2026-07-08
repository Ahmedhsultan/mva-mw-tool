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
    private String filePath;
    private String content;
    private String commitMessage;
    private boolean executed;

    public GitTask() {}

    @Override
    protected void execute() {
        devOpsContext.getRepoService()
                .pushFile(repoName, filePath, branch, content, commitMessage);
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
        // Git push is synchronous — if executed, it succeeded
        return executed ? TaskStatus.SUCCEEDED : TaskStatus.PENDING;
    }
}
