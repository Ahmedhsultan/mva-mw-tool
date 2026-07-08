package com.mva.mwtool.service.pipeline;

import com.mva.mwtool.service.pipeline.tasks.Task;
import lombok.Getter;

import java.util.*;
import java.util.stream.Collectors;

@Getter
public class PipelineGraph {

    private final Map<String, Task> taskMap;
    private final List<Task> rootTasks;

    public PipelineGraph(List<Task> tasks) {
        this.taskMap = tasks.stream()
                .collect(Collectors.toMap(Task::getId, t -> t));
        resolveLinks();
        injectGraph();
        this.rootTasks = findRootTasks();
    }

    private void resolveLinks() {
        for (Task task : taskMap.values()) {
            if (task.getNextTaskIds() != null) {
                for (String nextId : task.getNextTaskIds()) {
                    Task nextTask = taskMap.get(nextId);
                    if (nextTask != null) {
                        task.getNextTasks().add(nextTask);
                        nextTask.getPreviousTasks().add(task);
                    }
                }
            }
        }
    }

    private void injectGraph() {
        for (Task task : taskMap.values()) {
            task.setPipelineGraph(this);
        }
    }

    private List<Task> findRootTasks() {
        // Root tasks have no previous tasks (no one points to them)
        return taskMap.values().stream()
                .filter(t -> t.getPreviousTasks().isEmpty())
                .collect(Collectors.toList());
    }

    public Task getTaskById(String taskId) {
        return taskMap.get(taskId);
    }

    public Collection<Task> getAllTasks() {
        return taskMap.values();
    }
}

