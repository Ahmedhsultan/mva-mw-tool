package com.mva.mwtool.service.pipeline.util;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.service.pipeline.tasks.*;
import lombok.Setter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class TaskDeserializer extends StdDeserializer<Task> {

    @Setter
    private static DevOpsServiceFactory devOpsServiceFactory;
    @Setter
    private static DevOpsCredentials credentials;

    public TaskDeserializer() {
        super(Task.class);
    }

    @Override
    public Task deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        ObjectMapper mapper = (ObjectMapper) p.getCodec();
        JsonNode node = mapper.readTree(p);

        String taskType = node.get("taskType").asText();

        Class<? extends Task> taskClass = switch (taskType) {
            case "ApprovalTask" -> ApprovalTask.class;
            case "BuildTask" -> BuildTask.class;
            case "PrTask" -> PrTask.class;
            case "DeploymentTask" -> DeploymentTask.class;
            case "GitTask" -> GitTask.class;
            default -> throw new IllegalArgumentException("Unknown task type: " + taskType);
        };

        // Use a clean mapper (without this deserializer) to avoid infinite recursion
        ObjectMapper cleanMapper = new ObjectMapper();
        cleanMapper.configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        Task task = cleanMapper.treeToValue(node, taskClass);

        // Resolve provider from JSON and create DevOpsContext
        String provider = node.has("devOpsServiceFactory") ? node.get("devOpsServiceFactory").asText() : null;
        task.setDevOpsProvider(provider);
        if (provider != null) {
            DevOpsContext context = devOpsServiceFactory.create(provider, credentials);
            task.setDevOpsContext(context);
        }

        // Recursively parse nextTasks using the original mapper (with this deserializer)
        if (node.has("nextTasks") && node.get("nextTasks").isArray()) {
            List<Task> nextTasks = new ArrayList<>();
            for (JsonNode childNode : node.get("nextTasks")) {
                Task childTask = mapper.treeToValue(childNode, Task.class);
                nextTasks.add(childTask);
                childTask.setNextTasks(List.of(childTask));
            }
            task.setNextTasks(nextTasks);
        }

        return task;
    }
}
