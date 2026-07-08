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
        // Approval is a manual gate — mark as succeeded when approved
        this.approved = true;
    }

    @Override
    public boolean stop() {
        return !approved;
    }

    @Override
    public void reTryRun() {
        this.approved = false;
        execute();
    }

    @Override
    public TaskStatus getStatus() {
        return approved ? TaskStatus.SUCCEEDED : TaskStatus.WAITING_APPROVAL;
    }
}
