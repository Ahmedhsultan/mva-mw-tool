package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.RepoFileDto;
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
    private transient Object gitResult;

    public GitTask() {}

    @Override
    protected void execute() {
        devOpsContext.getRepoService()
                .pushFile(repoName, filePath, branch, content, commitMessage);
        this.succeeded = true;
    }

    @Override
    public Object getOutput() {
        return gitResult;
    }

    @Override
    public boolean stop() {
        return false;
    }

    @Override
    public void reTryRun() {
        this.succeeded = false;
        execute();
    }

    @Override
    public String getStatus() {
        return succeeded ? "succeeded" : "pending";
    }
}
