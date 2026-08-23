package com.mva.mwtool.service.pipeline.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PipelineVariableResolverTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void resolvesDeclaredVariablesAcrossTaskFields() throws Exception {
        JsonNode pipeline = objectMapper.readTree("""
            {
              "variables": [
                { "name": "BRANCH", "defaultValue": "main", "required": true },
                { "name": "ENV", "defaultValue": "dev", "required": true }
              ],
              "tasks": [
                {
                  "id": "build-1",
                  "taskType": "BuildTask",
                  "devOpsServiceFactory": "github",
                  "conditions": [],
                  "nextTaskIds": ["deploy-1"],
                  "branch": "refs/heads/${BRANCH}",
                  "repoName": "service-a",
                  "definitionId": "workflow-1"
                },
                {
                  "id": "deploy-1",
                  "taskType": "DeploymentTask",
                  "devOpsServiceFactory": "github",
                  "conditions": [{ "taskId": "build-1", "status": "SUCCEEDED" }],
                  "nextTaskIds": [],
                  "buildTaskId": "build-1",
                  "repoName": "service-a",
                  "definitionId": "deploy-1",
                  "environment": "${ENV}",
                  "description": "Deploy ${BRANCH} to ${ENV}"
                }
              ]
            }
            """);

        JsonNode resolved = PipelineVariableResolver.resolve(pipeline, Map.of("BRANCH", "release/2026.08"));

        assertEquals("refs/heads/release/2026.08", resolved.at("/tasks/0/branch").asText());
        assertEquals("dev", resolved.at("/tasks/1/environment").asText());
        assertEquals("Deploy release/2026.08 to dev", resolved.at("/tasks/1/description").asText());
        assertEquals("release/2026.08", resolved.at("/resolvedVariables/BRANCH").asText());
        assertEquals("dev", resolved.at("/resolvedVariables/ENV").asText());
    }

    @Test
    void failsWhenRequiredVariableIsBlank() throws Exception {
        JsonNode pipeline = objectMapper.readTree("""
            {
              "variables": [
                { "name": "ENV", "defaultValue": "", "required": true }
              ],
              "tasks": [
                {
                  "id": "deploy-1",
                  "taskType": "DeploymentTask",
                  "devOpsServiceFactory": "github",
                  "conditions": [],
                  "nextTaskIds": [],
                  "buildTaskId": "build-1",
                  "repoName": "service-a",
                  "definitionId": "deploy-1",
                  "environment": "${ENV}"
                }
              ]
            }
            """);

        IllegalArgumentException error = assertThrows(
            IllegalArgumentException.class,
            () -> PipelineVariableResolver.resolve(pipeline, Map.of())
        );

        assertEquals("Missing required pipeline variable: ENV", error.getMessage());
    }
}