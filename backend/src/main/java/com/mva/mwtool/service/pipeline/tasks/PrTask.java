package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class PrTask extends Task {
    private String fromBranch;
    private String targetBranch;
    private String repoName;
    private String prLink;

    public PrTask() {}

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
