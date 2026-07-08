package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.BuildDto;
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
        BuildDto build = devOpsContext.getBuildService()
                .createBuild(branch, repoName, definitionId);
        this.buildResult = build;
        this.buildLink = build.getUrl();
        this.succeeded = "succeeded".equalsIgnoreCase(build.getResult());
    }

    @Override
    public Object getOutput() {
        return buildResult;
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
