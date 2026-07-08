package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class ApprovalTask extends Task {
    private boolean approved;

    public ApprovalTask() {}

    @Override
    protected void execute() {
        // Approval is a manual gate — mark as succeeded when approved
        this.succeeded = approved;
    }

    @Override
    public Object getOutput() {
        return approved;
    }

    @Override
    public boolean stop() {
        return !approved;
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
