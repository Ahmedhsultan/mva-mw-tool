package com.mva.mwtool.service.pipeline;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.enums.TaskStatus;
import com.mva.mwtool.service.pipeline.tasks.Task;
import lombok.Getter;

import java.util.*;
import java.util.concurrent.*;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Collectors;

@Getter
public class PipelineGraph {

    private static final Logger log = Logger.getLogger(PipelineGraph.class.getName());

    private final Map<String, Task> taskMap;
    private final List<Task> rootTasks;
    private final String pipelineRunName = UUID.randomUUID().toString();
    private final JsonNode pipelineStructure;

    @JsonIgnore
    private transient ScheduledExecutorService scheduler;

    public PipelineGraph(List<Task> tasks, JsonNode pipelineStructure) {
        this.pipelineStructure = pipelineStructure;
        this.taskMap = tasks.stream()
                .collect(Collectors.toMap(Task::getId, t -> t));
        resolveLinks();
        injectGraph();
        this.rootTasks = findRootTasks();
    }

    public void startOrchestration() {
        for (Task rootTask : rootTasks) {
            rootTask.run();
        }
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "pipeline-" + pipelineRunName);
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleWithFixedDelay(this::advancePipeline, 5, 5, TimeUnit.SECONDS);
    }

    private void advancePipeline() {
        try {
            // Cache statuses once per cycle to avoid repeated HTTP calls
            Map<String, TaskStatus> statusCache = new HashMap<>();
            for (Task task : taskMap.values()) {
                try {
                    statusCache.put(task.getId(), task.getStatus());
                } catch (Exception e) {
                    log.log(Level.WARNING, "Failed to get status for task " + task.getId(), e);
                    statusCache.put(task.getId(), TaskStatus.PENDING);
                }
            }

            log.info("[Pipeline " + pipelineRunName + "] statuses: " + statusCache);

            // Try to advance pending tasks whose predecessors are done
            for (Task task : taskMap.values()) {
                TaskStatus currentStatus = statusCache.get(task.getId());
                if (currentStatus != TaskStatus.PENDING) {
                    continue;
                }
                // Don't retry a task whose execute() already failed
                if (task.isExecutionFailed()) {
                    continue;
                }
                // Don't re-start a task that's already been started
                if (task.isExecutionStarted()) {
                    continue;
                }

                List<Task> predecessors = task.getPreviousTasks();
                if (predecessors.isEmpty()) {
                    continue; // root task, already started
                }

                boolean allPredecessorsDone = predecessors.stream()
                        .allMatch(p -> isTerminal(statusCache.getOrDefault(p.getId(), TaskStatus.PENDING)));

                if (allPredecessorsDone) {
                    log.info("[Pipeline " + pipelineRunName + "] Starting task " + task.getId());
                    try {
                        task.run();
                    } catch (Exception e) {
                        task.setExecutionFailed(true);
                        task.setFailureMessage(e.getMessage());
                        log.log(Level.SEVERE, "Task " + task.getId() + " failed: " + e.getMessage());
                    }
                }
            }

            boolean allTerminal = statusCache.values().stream().allMatch(this::isTerminal);
            if (allTerminal) {
                log.info("[Pipeline " + pipelineRunName + "] All tasks terminal, stopping orchestrator");
                scheduler.shutdown();
            }
        } catch (Exception e) {
            log.log(Level.SEVERE, "Pipeline orchestrator error for " + pipelineRunName, e);
        }
    }

    private boolean isTerminal(TaskStatus status) {
        return status == TaskStatus.SUCCEEDED
                || status == TaskStatus.FAILED
                || status == TaskStatus.CANCELLED
                || status == TaskStatus.SKIPPED;
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

