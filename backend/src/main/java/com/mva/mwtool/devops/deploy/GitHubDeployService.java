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
    private final String project;

    public GitHubDeployService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("github");
        this.organization = credentials.getOrganization("github");
        this.project = credentials.getProject("github");
    }

    private String[] parseRepoId(String repoId) {
        if (repoId == null || repoId.isBlank()) {
            throw new IllegalArgumentException("repoId is required for GitHub deploy operations");
        }
        String normalized = repoId.trim();
        if (normalized.contains("/")) {
            return normalized.split("/", 2);
        }
        return new String[] { organization, normalized };
    }

    @Override
    public DeployDto getDeployById(String deployId, String environment) {
        String[] repo = parseRepoId(project);
        String url = String.format("%s/repos/%s/%s/deployments/%s",
                BASE_URL, repo[0], repo[1], deployId);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        return mapToDeployDto(response.getBody());
    }

    @Override
    public DeployDto createDeploy(String buildId, String definitionId, String environment, String description) {
        String[] repo = parseRepoId(project);
        String url = String.format("%s/repos/%s/%s/deployments",
                BASE_URL, repo[0], repo[1]);

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

    @Override
    public java.util.List<String> listEnvironments(String definitionId) {
        try {
            String[] repo = parseRepoId(project);
            String url = String.format("%s/repos/%s/%s/deployments", BASE_URL, repo[0], repo[1]);
            HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
            ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

            JsonNode body = response.getBody();
            if (body == null || !body.isArray()) return Collections.emptyList();

            Set<String> envs = new LinkedHashSet<>();
            for (JsonNode item : body) {
                String env = item.path("environment").asText(null);
                if (env != null && !env.isEmpty()) envs.add(env);
            }

            return new ArrayList<>(envs);
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }
}
