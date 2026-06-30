package com.mva.mwtool.devops.build;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.GitHubAuthService;
import com.mva.mwtool.dto.BuildDto;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service("githubBuildService")
public class GitHubBuildService implements BuildService {

    private static final String BASE_URL = "https://api.github.com";

    private final RestTemplate restTemplate;

    public GitHubBuildService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public BuildDto getBuildById(String pat, String organization, String project, String buildId) {
        // organization = owner, project = repo
        String url = String.format("%s/repos/%s/%s/actions/runs/%s",
                BASE_URL, organization, project, buildId);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        return mapToBuildDto(response.getBody());
    }

    @Override
    public List<BuildDto> getBuildsByBranchAndRepo(String pat, String organization, String project,
                                                    String branch, String repoId) {
        // repoId is used as repo name for GitHub
        String url = String.format("%s/repos/%s/%s/actions/runs?branch=%s",
                BASE_URL, organization, repoId, branch);

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
    public BuildDto createBuild(String pat, String organization, String project,
                                String branch, String repoId, String definitionId) {
        // definitionId = workflow_id or workflow filename
        String url = String.format("%s/repos/%s/%s/actions/workflows/%s/dispatches",
                BASE_URL, organization, repoId, definitionId);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("ref", branch);

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);

        // GitHub Actions dispatch returns 204 with no body, return a stub
        BuildDto dto = new BuildDto();
        dto.setStatus("queued");
        dto.setSourceBranch(branch);
        dto.setDefinitionId(definitionId);
        return dto;
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
