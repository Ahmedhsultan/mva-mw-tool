package com.mva.mwtool.devops.deploy;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.GitHubAuthService;
import com.mva.mwtool.dto.DeployDto;
import com.mva.mwtool.dto.DevOpsCredentials;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

public class GitHubDeployService implements DeployService {

    private static final String BASE_URL = "https://api.github.com";

    private final RestTemplate restTemplate;
    private final String pat;
    private final String organization;

    public GitHubDeployService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("github");
        this.organization = credentials.getOrganization("github");
    }

    @Override
    public DeployDto getDeployById(String deployId) {
        String url = String.format("%s/repos/%s/%s/deployments/%s",
                BASE_URL, organization, deployId, deployId);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        return mapToDeployDto(response.getBody());
    }

    @Override
    public DeployDto createDeploy(String buildId, String definitionId, String environment, String description) {
        String url = String.format("%s/repos/%s/%s/deployments",
                BASE_URL, organization, definitionId);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("ref", "main");
        requestBody.put("environment", environment);
        requestBody.put("description", description != null ? description : "Deployed via MVA-MW-Tool");
        requestBody.put("auto_merge", false);
        requestBody.put("required_contexts", List.of());
        requestBody.put("payload", Map.of("build_id", buildId));

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
        return mapToDeployDto(response.getBody());
    }

    private DeployDto mapToDeployDto(JsonNode node) {
        if (node == null) return null;
        DeployDto dto = new DeployDto();
        dto.setId(node.path("id").asText());
        dto.setEnvironment(node.path("environment").asText());
        dto.setStatus(node.path("task").asText());
        dto.setName(node.path("description").asText());
        dto.setUrl(node.path("url").asText());
        dto.setArtifacts(List.of(node.path("ref").asText()));
        return dto;
    }
}
