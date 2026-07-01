package com.mva.mwtool.service.pipeline.tasks;

import java.util.List;

public class ApprovalTask extends Task {
    private boolean approved;

    @Override
    public void execute() {

    }

    @Override
    public boolean checkConditions(List<Task> previousTasks) {
        return false;
    }

    @Override
    public boolean isSucceed() {
        return approved;
    }

    @Override
    public Object getOutput() {
        return null;
    }
}
