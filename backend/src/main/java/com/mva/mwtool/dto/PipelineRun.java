package com.mva.mwtool.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.service.pipeline.tasks.Task;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

@Data
@AllArgsConstructor
public class PipelineRun {
    private Task rootTasks;
    private String pipelineRunName;
    private JsonNode pipeline;

    public Task findTaskById(String taskId) {
        return searchTask(rootTasks, taskId);
    }

    private Task searchTask(Task task, String taskId) {
        if (task == null) return null;
        if (taskId.equals(task.getId())) return task;
        List<Task> nextTasks = task.getNextTasks();
        if (nextTasks != null) {
            for (Task child : nextTasks) {
                Task found = searchTask(child, taskId);
                if (found != null) return found;
            }
        }
        return null;
    }
}
