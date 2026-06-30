package com.mva.mwtool.devops.deploy;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.AzureAuthService;
import com.mva.mwtool.dto.DeployDto;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service("azureDeployService")
public class AzureDeployService implements DeployService {

    private static final String BASE_URL = "https://vsrm.dev.azure.com";
    private static final String API_VERSION = "7.1";

    private final RestTemplate restTemplate;

    public AzureDeployService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public DeployDto getDeployById(String pat, String organization, String project, String deployId) {
        String url = String.format("%s/%s/%s/_apis/release/releases/%s?api-version=%s",
                BASE_URL, organization, project, deployId, API_VERSION);

        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        return mapToDeployDto(response.getBody());
    }

    @Override
    public DeployDto createDeploy(String pat, String organization, String project,
                                  String buildId, String definitionId, String environment,
                                  String description) {
        String url = String.format("%s/%s/%s/_apis/release/releases?api-version=%s",
                BASE_URL, organization, project, API_VERSION);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("definitionId", Integer.parseInt(definitionId));
        requestBody.put("description", description != null ? description : "Triggered via MVA-MW-Tool");
        requestBody.put("isDraft", false);

        Map<String, Object> artifact = new HashMap<>();
        artifact.put("alias", "_build");
        Map<String, Object> instanceRef = new HashMap<>();
        instanceRef.put("id", buildId);
        artifact.put("instanceReference", instanceRef);
        requestBody.put("artifacts", List.of(artifact));

        HttpHeaders headers = AzureAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
        return mapToDeployDto(response.getBody());
    }

    private DeployDto mapToDeployDto(JsonNode node) {
        if (node == null) return null;
        DeployDto dto = new DeployDto();
        dto.setId(node.path("id").asText());
        dto.setName(node.path("name").asText());
        dto.setStatus(node.path("status").asText());

        List<String> artifacts = new ArrayList<>();
        if (node.has("artifacts")) {
            for (JsonNode art : node.get("artifacts")) {
                artifacts.add(art.path("alias").asText());
            }
        }
        dto.setArtifacts(artifacts);

        if (node.has("environments") && node.get("environments").isArray()
                && !node.get("environments").isEmpty()) {
            dto.setEnvironment(node.get("environments").get(0).path("name").asText());
        }

        return dto;
    }
}
