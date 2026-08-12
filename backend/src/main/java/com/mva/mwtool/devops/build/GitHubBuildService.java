package com.mva.mwtool.devops.build;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.GitHubAuthService;
import com.mva.mwtool.dto.BuildDto;
import com.mva.mwtool.dto.DevOpsCredentials;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class GitHubBuildService implements BuildService {

    private static final String BASE_URL = "https://api.github.com";

    private final RestTemplate restTemplate;
    private final String pat;
    private final String organization;
    private final String project;

    public GitHubBuildService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("github");
        this.organization = credentials.getOrganization("github");
        this.project = credentials.getProject("github");
    }

    private String[] parseRepoId(String repoId) {
        if (repoId == null || repoId.isBlank()) {
            throw new IllegalArgumentException("repoId is required for GitHub operations");
        }
        String normalized = repoId.trim();
        if (normalized.contains("/")) {
            return normalized.split("/", 2);
        }
        return new String[] { organization, normalized };
    }

    @Override
    public BuildDto getBuildById(String buildId) {
        String[] repo = parseRepoId(project);
        String url = String.format("%s/repos/%s/%s/actions/runs/%s",
                BASE_URL, repo[0], repo[1], buildId);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        return mapToBuildDto(response.getBody());
    }

    @Override
    public List<BuildDto> getBuildsByBranchAndRepo(String branch, String repoId) {
        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/actions/runs?branch=%s",
                BASE_URL, repo[0], repo[1], branch);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        List<BuildDto> builds = new ArrayList<>();
        JsonNode body = response.getBody();
        if (body != null && body.has("workflow_runs")) {
            for (JsonNode node : body.get("workflow_runs")) {
                builds.add(mapToBuildDto(node));
            }
        }
        return builds;
    }

    @Override
    public BuildDto createBuild(String branch, String repoId, String definitionId) {
        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/actions/workflows/%s/dispatches",
                BASE_URL, repo[0], repo[1], definitionId);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("ref", branch);

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);

        BuildDto dto = new BuildDto();
        dto.setStatus("queued");
        dto.setSourceBranch(branch);
        dto.setDefinitionId(definitionId);
        return dto;
    }

    @Override
    public void cancelBuild(String buildId) {
        String[] repo = parseRepoId(project);
        String url = String.format("%s/repos/%s/%s/actions/runs/%s/cancel",
                BASE_URL, repo[0], repo[1], buildId);

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
    }

    private BuildDto mapToBuildDto(JsonNode node) {
        if (node == null) return null;
        BuildDto dto = new BuildDto();
        dto.setId(node.path("id").asText());
        dto.setBuildNumber(node.path("run_number").asText());
        dto.setStatus(node.path("status").asText());
        dto.setResult(node.path("conclusion").asText());
        dto.setSourceBranch(node.path("head_branch").asText());
        dto.setDefinitionName(node.path("name").asText());
        dto.setDefinitionId(node.path("workflow_id").asText());
        dto.setUrl(node.path("html_url").asText());
        return dto;
    }
}
