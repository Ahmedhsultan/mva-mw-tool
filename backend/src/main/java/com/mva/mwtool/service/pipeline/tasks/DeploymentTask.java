package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class DeploymentTask extends Task {
    private String buildId;
    private String repoName;
    private String deploymentLink;

    public DeploymentTask() {}

    @Override
    public void execute() {

    }

    @Override
    public boolean checkConditions(List<Task> previousTasks) {
        return false;
    }

    @Override
    public boolean isSucceed() {
        return false;
    }

    @Override
    public Object getOutput() {
        return null;
    }
}
