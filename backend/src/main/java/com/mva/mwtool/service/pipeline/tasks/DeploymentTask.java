package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.dto.DeployDto;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class DeploymentTask extends Task {
    private String buildId;
    private String repoName;
    private String definitionId;
    private String environment;
    private String description;
    private String deploymentLink;
    private transient DeployDto deployResult;

    public DeploymentTask() {}

    @Override
    protected void execute() {
        DeployDto deploy = devOpsContext.getDeployService()
                .createDeploy(buildId, definitionId, environment, description);
        this.deployResult = deploy;
        this.deploymentLink = deploy.getId();
        this.succeeded = "succeeded".equalsIgnoreCase(deploy.getStatus());
    }

    @Override
    public Object getOutput() {
        return deployResult;
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
