package com.mva.mwtool.devops.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.AzureAuthService;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.PrDto;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

public class AzureRepoService implements RepoService {

    private static final String BASE_URL = "https://dev.azure.com";
    private static final String API_VERSION = "7.1";

    private final RestTemplate restTemplate;
    private final String pat;
    private final String organization;
    private final String project;

    public AzureRepoService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("azure");
        this.organization = credentials.getOrganization("azure");
        this.project = credentials.getProject("azure");
    }

    @Override
    public RepoFileDto pullFile(String repoId, String filePath, String branch) {
        String url = String.format(
                "%s/%s/%s/_apis/git/repositories/%s/items?path=%s&versionDescriptor.version=%s" +
                        "&versionDescriptor.versionType=branch&includeContent=true&$format=json&api-version=%s",
                BASE_URL, organization, project, repoId, filePath, branch, API_VERSION);

        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        JsonNode body = response.getBody();
        if (body != null) {
            return new RepoFileDto(
                    body.path("path").asText(),
                    body.path("content").asText(),
                    body.path("commitId").asText()
            );
        }
        return null;
    }

    @Override
    public void pushFile(String repoId, String filePath, String branch, String content, String commitMessage) {
        String currentCommitId = getCurrentCommitId(repoId, branch);
        String changeType = fileExists(repoId, filePath, branch) ? "edit" : "add";

        String url = String.format("%s/%s/%s/_apis/git/repositories/%s/pushes?api-version=%s",
                BASE_URL, organization, project, repoId, API_VERSION);

        String branchRef = branch.startsWith("refs/") ? branch : "refs/heads/" + branch;

        Map<String, Object> requestBody = new HashMap<>();

        Map<String, Object> refUpdate = new HashMap<>();
        refUpdate.put("name", branchRef);
        refUpdate.put("oldObjectId", currentCommitId);
        requestBody.put("refUpdates", List.of(refUpdate));

        Map<String, Object> change = new HashMap<>();
        change.put("changeType", changeType);
        Map<String, String> item = new HashMap<>();
        item.put("path", filePath);
        change.put("item", item);
        Map<String, String> newContent = new HashMap<>();
        newContent.put("content", content);
        newContent.put("contentType", "rawtext");
        change.put("newContent", newContent);

        Map<String, Object> commit = new HashMap<>();
        commit.put("comment", commitMessage);
        commit.put("changes", List.of(change));
        requestBody.put("commits", List.of(commit));

        HttpHeaders headers = AzureAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
    }

    private boolean fileExists(String repoId, String filePath, String branch) {
        try {
            pullFile(repoId, filePath, branch);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private String getCurrentCommitId(String repoId, String branch) {
        String branchRef = branch.startsWith("refs/") ? branch : "refs/heads/" + branch;
        String url = String.format(
                "%s/%s/%s/_apis/git/repositories/%s/refs?filter=%s&api-version=%s",
                BASE_URL, organization, project, repoId,
                branchRef.replace("refs/", ""), API_VERSION);

        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        JsonNode body = response.getBody();
        if (body != null && body.has("value") && !body.get("value").isEmpty()) {
            return body.get("value").get(0).path("objectId").asText();
        }
        throw new RuntimeException("Could not resolve branch ref: " + branch);
    }

    @Override
    public PrDto createPullRequest(String repoId, String sourceBranch, String targetBranch, String title, String description) {
        String url = String.format("%s/%s/%s/_apis/git/repositories/%s/pullrequests?api-version=%s",
                BASE_URL, organization, project, repoId, API_VERSION);

        String sourceRef = sourceBranch.startsWith("refs/") ? sourceBranch : "refs/heads/" + sourceBranch;
        String targetRef = targetBranch.startsWith("refs/") ? targetBranch : "refs/heads/" + targetBranch;

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("sourceRefName", sourceRef);
        requestBody.put("targetRefName", targetRef);
        requestBody.put("title", title != null ? title : sourceBranch + " → " + targetBranch);
        requestBody.put("description", description != null ? description : "Created via MVA-MW-Tool");

        HttpHeaders headers = AzureAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
        JsonNode body = response.getBody();

        PrDto dto = new PrDto();
        if (body != null) {
            dto.setId(body.path("pullRequestId").asText());
            dto.setTitle(body.path("title").asText());
            dto.setStatus(body.path("status").asText());
            String webUrl = body.path("url").asText();
            // Build the human-readable URL
            dto.setUrl(String.format("%s/%s/%s/_git/%s/pullrequest/%s",
                    BASE_URL, organization, project, repoId, dto.getId()));
        }
        return dto;
    }
}
