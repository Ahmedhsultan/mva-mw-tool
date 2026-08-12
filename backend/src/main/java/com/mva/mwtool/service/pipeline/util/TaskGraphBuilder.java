package com.mva.mwtool.service.pipeline.util;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.service.pipeline.PipelineGraph;
import com.mva.mwtool.service.pipeline.tasks.*;

import java.util.ArrayList;
import java.util.List;

public class TaskGraphBuilder {

    private static final ObjectMapper cleanMapper = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    public static PipelineGraph build(JsonNode pipelineStructure, DevOpsServiceFactory devOpsServiceFactory, DevOpsCredentials credentials) {
        JsonNode tasksNode = pipelineStructure.get("tasks");
        if (tasksNode == null || !tasksNode.isArray()) {
            throw new IllegalArgumentException("Pipeline structure must have a 'tasks' array");
        }

        List<Task> tasks = new ArrayList<>();
        for (JsonNode node : tasksNode) {
            Task task = deserializeTask(node, devOpsServiceFactory, credentials);
            tasks.add(task);
        }

        return new PipelineGraph(tasks, pipelineStructure);
    }

    private static Task deserializeTask(JsonNode node, DevOpsServiceFactory devOpsServiceFactory, DevOpsCredentials credentials) {
        String taskType = node.get("taskType").asText();

        Class<? extends Task> taskClass = switch (taskType) {
            case "ApprovalTask" -> ApprovalTask.class;
            case "BuildTask" -> BuildTask.class;
            case "PrTask" -> PrTask.class;
            case "DeploymentTask" -> DeploymentTask.class;
            case "GitTask" -> GitTask.class;
            default -> throw new IllegalArgumentException("Unknown task type: " + taskType);
        };

        try {
            Task task = cleanMapper.treeToValue(node, taskClass);

            // Resolve provider and create DevOpsContext
            String provider = node.has("devOpsServiceFactory") ? node.get("devOpsServiceFactory").asText() : null;
            task.setDevOpsProvider(provider);
            if (provider != null) {
                DevOpsCredentials credsForTask = credentials;
                // If provider is GitHub and the task has a repoName, prefer that as the repo (project)
                if ("github".equalsIgnoreCase(provider) && task instanceof com.mva.mwtool.service.pipeline.tasks.Task) {
                    String repoName = null;
                    try {
                        // reflectively attempt to read repoName field if present
                        var field = task.getClass().getDeclaredField("repoName");
                        field.setAccessible(true);
                        Object val = field.get(task);
                        if (val instanceof String) repoName = ((String) val).trim();
                    } catch (NoSuchFieldException | IllegalAccessException ignored) {
                    }

                    if (repoName != null && !repoName.isEmpty()) {
                        // create a shallow copy of credentials with github.project set to repoName
                        var originalGithub = credentials.getGithub();
                        if (originalGithub != null) {
                            var newGithub = new com.mva.mwtool.dto.GitHubCredentials(
                                    originalGithub.getPat(),
                                    originalGithub.getOrganization(),
                                    repoName
                            );
                            credsForTask = new DevOpsCredentials(credentials.getAzure(), newGithub);
                        }
                    }
                }

                DevOpsContext context = devOpsServiceFactory.create(provider, credsForTask);
                task.setDevOpsContext(context);
            }

            return task;
        } catch (Exception e) {
            throw new RuntimeException("Failed to deserialize task: " + node, e);
        }
    }
}
