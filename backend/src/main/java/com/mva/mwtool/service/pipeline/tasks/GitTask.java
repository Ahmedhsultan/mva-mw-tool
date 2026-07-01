package com.mva.mwtool.service.pipeline.tasks;

import java.util.List;

public class GitTask extends Task {

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
