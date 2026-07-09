package com.mva.mwtool.devops.deploy;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.AzureAuthService;
import com.mva.mwtool.dto.DeployDto;
import com.mva.mwtool.dto.DevOpsCredentials;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

public class AzureDeployService implements DeployService {

    private static final String BASE_URL = "https://vsrm.dev.azure.com";
    private static final String API_VERSION = "7.1";

    private final RestTemplate restTemplate;
    private final String pat;
    private final String organization;
    private final String project;

    public AzureDeployService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("azure");
        this.organization = credentials.getOrganization("azure");
        this.project = credentials.getProject("azure");
    }

    @Override
    public DeployDto getDeployById(String deployId, String environment) {
        String url = String.format("%s/%s/%s/_apis/release/releases/%s?api-version=%s",
                BASE_URL, organization, project, deployId, API_VERSION);

        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        return mapToDeployDto(response.getBody(), environment);
    }

    @Override
    public DeployDto createDeploy(String buildId, String definitionId, String environment, String description) {
        // Fetch the release definition to resolve the actual artifact alias
        String artifactAlias = resolveArtifactAlias(definitionId);

        String url = String.format("%s/%s/%s/_apis/release/releases?api-version=%s",
                BASE_URL, organization, project, API_VERSION);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("definitionId", Integer.parseInt(definitionId));
        requestBody.put("description", description != null ? description : "Triggered via MVA-MW-Tool");
        requestBody.put("isDraft", false);

        Map<String, Object> artifact = new HashMap<>();
        artifact.put("alias", artifactAlias);
        Map<String, Object> instanceRef = new HashMap<>();
        instanceRef.put("id", buildId);
        artifact.put("instanceReference", instanceRef);
        requestBody.put("artifacts", List.of(artifact));

        HttpHeaders headers = AzureAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
        JsonNode releaseNode = response.getBody();

        // Trigger the target environment deployment
        if (releaseNode != null && environment != null && !environment.isBlank()) {
            triggerEnvironment(releaseNode, environment);
        }

        return mapToDeployDto(releaseNode, environment);
    }

    private String resolveArtifactAlias(String definitionId) {
        String url = String.format("%s/%s/%s/_apis/release/definitions/%s?api-version=%s",
                BASE_URL, organization, project, definitionId, API_VERSION);
        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);
        JsonNode body = response.getBody();
        if (body != null && body.has("artifacts") && body.get("artifacts").isArray()
                && !body.get("artifacts").isEmpty()) {
            return body.get("artifacts").get(0).path("alias").asText("_build");
        }
        return "_build"; // fallback
    }

    private void triggerEnvironment(JsonNode releaseNode, String targetEnvironment) {
        String releaseId = releaseNode.path("id").asText();
        JsonNode environments = releaseNode.get("environments");
        if (environments == null || !environments.isArray()) return;

        for (JsonNode env : environments) {
            if (targetEnvironment.equalsIgnoreCase(env.path("name").asText())) {
                String envId = env.path("id").asText();
                String url = String.format("%s/%s/%s/_apis/release/releases/%s/environments/%s?api-version=%s",
                        BASE_URL, organization, project, releaseId, envId, API_VERSION);

                Map<String, Object> body = new HashMap<>();
                body.put("status", "inProgress");
                body.put("comment", "Triggered via MVA-MW-Tool");

                HttpHeaders headers = AzureAuthService.createHeaders(pat);
                headers.setContentType(MediaType.APPLICATION_JSON);
                HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
                restTemplate.exchange(url, HttpMethod.PATCH, entity, JsonNode.class);
                return;
            }
        }
    }

    private DeployDto mapToDeployDto(JsonNode node, String targetEnvironment) {
        if (node == null) return null;
        DeployDto dto = new DeployDto();
        dto.setId(node.path("id").asText());
        dto.setName(node.path("name").asText());
        dto.setUrl(node.path("_links").path("web").path("href").asText());

        List<String> artifacts = new ArrayList<>();
        if (node.has("artifacts")) {
            for (JsonNode art : node.get("artifacts")) {
                artifacts.add(art.path("alias").asText());
            }
        }
        dto.setArtifacts(artifacts);

        if (node.has("environments") && node.get("environments").isArray()
                && !node.get("environments").isEmpty()) {
            JsonNode envNode = findEnvironment(node.get("environments"), targetEnvironment);
            dto.setEnvironment(envNode.path("name").asText());
            dto.setStatus(envNode.path("status").asText());
        } else {
            dto.setStatus(node.path("status").asText());
        }

        return dto;
    }

    private JsonNode findEnvironment(JsonNode environments, String targetEnvironment) {
        if (targetEnvironment != null && !targetEnvironment.isBlank()) {
            for (JsonNode env : environments) {
                if (targetEnvironment.equalsIgnoreCase(env.path("name").asText())) {
                    return env;
                }
            }
        }
        return environments.get(0);
    }
}
