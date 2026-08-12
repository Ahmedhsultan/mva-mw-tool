package com.mva.mwtool.service.pipeline.util;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.ConnectorCredentials;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.service.pipeline.PipelineGraph;
import com.mva.mwtool.service.pipeline.tasks.*;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class TaskGraphBuilder {

    private static final Logger log = LoggerFactory.getLogger(TaskGraphBuilder.class);

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

            String connectorName = node.has("devOpsServiceFactory") ? node.get("devOpsServiceFactory").asText() : null;
            log.info("[TaskGraph] task '{}' devOpsServiceFactory='{}', connectors={}",
                    node.has("id") ? node.get("id").asText() : "?",
                    connectorName,
                    credentials.getConnectors() != null ? credentials.getConnectors().keySet() : "null");
            if (connectorName != null) {
                Map<String, ConnectorCredentials> connectors = credentials.getConnectors();
                ConnectorCredentials connector = connectors != null ? connectors.get(connectorName) : null;
                if (connector == null) {
                    throw new IllegalArgumentException("Connector not found: " + connectorName);
                }
                String provider = connector.getType();
                log.info("[TaskGraph] resolved connector '{}' -> type='{}', org='{}'",
                        connectorName, provider, connector.getOrganization());
                task.setDevOpsProvider(provider);
                DevOpsCredentials taskCreds = buildCredentialsFromConnector(connector);
                DevOpsContext context = devOpsServiceFactory.create(provider, taskCreds);
                task.setDevOpsContext(context);
            }

            return task;
        } catch (Exception e) {
            throw new RuntimeException("Failed to deserialize task: " + node, e);
        }
    }

    private static DevOpsCredentials buildCredentialsFromConnector(ConnectorCredentials connector) {
        DevOpsCredentials creds = new DevOpsCredentials();
        creds.setConnectors(Map.of(connector.getType(), connector));
        return creds;
    }
}
