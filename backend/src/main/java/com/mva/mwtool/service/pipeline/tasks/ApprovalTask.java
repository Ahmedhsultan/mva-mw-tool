package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.mva.mwtool.enums.TaskStatus;
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
        // Manual gate: leave unapproved so downstream tasks stay paused until approve() is called
    }

    public void approve() {
        this.approved = true;
        this.executionFailed = false;
        this.failureMessage = null;
        this.lastKnownStatus = TaskStatus.SUCCEEDED;
    }

    @Override
    public boolean stop() {
        return !approved;
    }

    @Override
    public void reTryRun() {
        this.approved = false;
        this.executionFailed = false;
        this.failureMessage = null;
        this.executionStarted = true;
        this.lastKnownStatus = TaskStatus.WAITING_APPROVAL;
    }

    @Override
    protected TaskStatus computeStatus() {
        if (executionFailed) {
            return TaskStatus.FAILED;
        }
        if (approved) {
            return TaskStatus.SUCCEEDED;
        }
        return executionStarted ? TaskStatus.WAITING_APPROVAL : TaskStatus.PENDING;
    }
}
