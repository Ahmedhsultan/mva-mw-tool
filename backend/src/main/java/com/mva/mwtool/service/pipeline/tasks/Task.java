package com.mva.mwtool.service.pipeline.tasks;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.Condition;
import com.mva.mwtool.service.pipeline.TaskDeserializer;
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

    protected transient DevOpsServiceFactory devOpsServiceFactory;

    public Task() {}

    public final void run() {
        if(checkConditions(previousTasks)){
            execute();
        }
    }

    public abstract void execute();
    public abstract boolean checkConditions(List<Task> previousTasks);
    public abstract boolean isSucceed();
    public abstract Object getOutput();
}
