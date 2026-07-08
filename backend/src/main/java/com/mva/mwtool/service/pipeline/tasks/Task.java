package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.dto.Condition;
import com.mva.mwtool.service.pipeline.util.TaskDeserializer;
import lombok.Data;

import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonDeserialize(using = TaskDeserializer.class)
public abstract class Task {
    private String id;
    private String taskType;
    private List<Condition> conditions;
    private List<Task> previousTasks;
    private List<Task> nextTasks;
    private String devOpsProvider;

    protected transient DevOpsContext devOpsContext;
    protected boolean succeeded;

    public Task() {}

    public final void run() {
        if (checkConditions(previousTasks)) {
            execute();
        }
    }

    public boolean checkConditions(List<Task> previousTasks) {
        if (conditions == null || conditions.isEmpty()) {
            return true;
        }
        if (previousTasks == null) {
            return false;
        }
        for (Condition condition : conditions) {
            Task previousTask = previousTasks.stream()
                    .filter(t -> t.getId().equals(condition.getTaskId()))
                    .findFirst()
                    .orElse(null);
            if (previousTask == null || previousTask.isSucceed() != condition.isSucceed()) {
                return false;
            }
        }
        return true;
    }

    public boolean isSucceed() {
        return succeeded;
    }

    protected abstract void execute();
    public abstract Object getOutput();
    public abstract boolean stop();
    public abstract void reTryRun();
    public abstract String getStatus();
}
