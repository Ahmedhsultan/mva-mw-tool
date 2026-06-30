package com.mva.mwtool.devops.build;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.AzureAuthService;
import com.mva.mwtool.dto.BuildDto;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service("azureBuildService")
public class AzureBuildService implements BuildService {

    private static final String BASE_URL = "https://dev.azure.com";
    private static final String API_VERSION = "7.1";

    private final RestTemplate restTemplate;

    public AzureBuildService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public BuildDto getBuildById(String pat, String organization, String project, String buildId) {
        String url = String.format("%s/%s/%s/_apis/build/builds/%s?api-version=%s",
                BASE_URL, organization, project, buildId, API_VERSION);

        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        return mapToBuildDto(response.getBody());
    }

    @Override
    public List<BuildDto> getBuildsByBranchAndRepo(String pat, String organization, String project,
                                                    String branch, String repoId) {
        String branchRef = branch.startsWith("refs/") ? branch : "refs/heads/" + branch;
        String url = String.format(
                "%s/%s/%s/_apis/build/builds?branchName=%s&repositoryId=%s&repositoryType=TfsGit&api-version=%s",
                BASE_URL, organization, project, branchRef, repoId, API_VERSION);

        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        List<BuildDto> builds = new ArrayList<>();
        JsonNode body = response.getBody();
        if (body != null && body.has("value")) {
            for (JsonNode node : body.get("value")) {
                builds.add(mapToBuildDto(node));
            }
        }
        return builds;
    }

    @Override
    public BuildDto createBuild(String pat, String organization, String project,
                                String branch, String repoId, String definitionId) {
        String url = String.format("%s/%s/%s/_apis/build/builds?api-version=%s",
                BASE_URL, organization, project, API_VERSION);

        String branchRef = branch.startsWith("refs/") ? branch : "refs/heads/" + branch;

        Map<String, Object> requestBody = new HashMap<>();
        Map<String, Object> definition = new HashMap<>();
        definition.put("id", Integer.parseInt(definitionId));
        requestBody.put("definition", definition);
        requestBody.put("sourceBranch", branchRef);

        Map<String, Object> repository = new HashMap<>();
        repository.put("id", repoId);
        repository.put("type", "TfsGit");
        requestBody.put("repository", repository);

        HttpHeaders headers = AzureAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
        return mapToBuildDto(response.getBody());
    }

    private BuildDto mapToBuildDto(JsonNode node) {
        if (node == null) return null;
        BuildDto dto = new BuildDto();
        dto.setId(node.path("id").asText());
        dto.setBuildNumber(node.path("buildNumber").asText());
        dto.setStatus(node.path("status").asText());
        dto.setResult(node.path("result").asText());
        dto.setSourceBranch(node.path("sourceBranch").asText());
        dto.setDefinitionName(node.path("definition").path("name").asText());
        dto.setDefinitionId(node.path("definition").path("id").asText());
        dto.setUrl(node.path("_links").path("web").path("href").asText());
        return dto;
    }
}
