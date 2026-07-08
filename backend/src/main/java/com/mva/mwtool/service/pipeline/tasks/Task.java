package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.dto.Condition;
import com.mva.mwtool.enums.TaskStatus;
import com.mva.mwtool.service.pipeline.PipelineGraph;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public abstract class Task {
    private String id;
    private String taskType;
    private List<Condition> conditions;
    private String devOpsProvider;

    @JsonProperty("nextTaskIds")
    private List<String> nextTaskIds = new ArrayList<>();

    // Resolved at runtime (not from JSON)
    @JsonIgnore
    protected transient List<Task> nextTasks = new ArrayList<>();
    @JsonIgnore
    protected transient List<Task> previousTasks = new ArrayList<>();
    @JsonIgnore
    protected transient DevOpsContext devOpsContext;
    @JsonIgnore
    protected transient PipelineGraph pipelineGraph;
    @JsonIgnore
    protected transient boolean executionFailed;

    protected transient String failureMessage;

    public Task() {}

    public final void run() {
        if (checkConditions()) {
            execute();
        }
    }

    public boolean checkConditions() {
        if (conditions == null || conditions.isEmpty()) {
            return true;
        }
        if (previousTasks == null || previousTasks.isEmpty()) {
            return true;
        }
        for (Condition condition : conditions) {
            Task previousTask = previousTasks.stream()
                    .filter(t -> t.getId().equals(condition.getTaskId()))
                    .findFirst()
                    .orElse(null);
            if (previousTask == null || !previousTask.getStatus().name().equalsIgnoreCase(condition.getStatus())) {
                return false;
            }
        }
        return true;
    }

    protected abstract void execute();
    public abstract boolean stop();
    public abstract void reTryRun();
    public abstract TaskStatus getStatus();
}
