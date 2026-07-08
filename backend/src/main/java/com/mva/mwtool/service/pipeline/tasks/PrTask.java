package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.RepoFileDto;
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
    private transient Object prResult;

    public PrTask() {}

    @Override
    protected void execute() {
        // PR creation uses the repo service to push changes from fromBranch to targetBranch
        RepoFileDto result = devOpsContext.getRepoService()
                .pullFile(repoName, "", fromBranch);
        this.prResult = result;
        this.succeeded = result != null;
    }

    @Override
    public Object getOutput() {
        return prResult;
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
