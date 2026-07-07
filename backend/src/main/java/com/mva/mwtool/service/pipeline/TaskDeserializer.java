package com.mva.mwtool.service.pipeline;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.service.pipeline.tasks.*;
import lombok.Setter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public class TaskDeserializer extends StdDeserializer<Task> {

    @Setter
    private static DevOpsServiceFactory devOpsServiceFactory;

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

        // Inject DevOpsServiceFactory using the provider value from JSON
        task.setDevOpsServiceFactory(devOpsServiceFactory);

        // Recursively parse nextTasks using the original mapper (with this deserializer)
        if (node.has("nextTasks") && node.get("nextTasks").isArray()) {
            List<Task> nextTasks = new ArrayList<>();
            for (JsonNode childNode : node.get("nextTasks")) {
                Task childTask = mapper.treeToValue(childNode, Task.class);
                nextTasks.add(childTask);
            }
            task.setNextTasks(nextTasks);
        }

        return task;
    }
}
