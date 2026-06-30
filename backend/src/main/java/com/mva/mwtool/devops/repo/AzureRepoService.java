package com.mva.mwtool.devops.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.AzureAuthService;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service("azureRepoService")
public class AzureRepoService implements RepoService {

    private static final String BASE_URL = "https://dev.azure.com";
    private static final String API_VERSION = "7.1";

    private final RestTemplate restTemplate;

    public AzureRepoService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public RepoFileDto pullFile(String pat, String organization, String project,
                                String repoId, String filePath, String branch) {
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
    public void pushFile(String pat, String organization, String project,
                         String repoId, String filePath, String branch,
                         String content, String commitMessage) {
        // First get the current commit SHA for the branch
        String currentCommitId = getCurrentCommitId(pat, organization, project, repoId, branch);

        String url = String.format("%s/%s/%s/_apis/git/repositories/%s/pushes?api-version=%s",
                BASE_URL, organization, project, repoId, API_VERSION);

        String branchRef = branch.startsWith("refs/") ? branch : "refs/heads/" + branch;

        Map<String, Object> requestBody = new HashMap<>();

        Map<String, Object> refUpdate = new HashMap<>();
        refUpdate.put("name", branchRef);
        refUpdate.put("oldObjectId", currentCommitId);
        requestBody.put("refUpdates", List.of(refUpdate));

        Map<String, Object> change = new HashMap<>();
        change.put("changeType", "edit");
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

    private String getCurrentCommitId(String pat, String organization, String project,
                                      String repoId, String branch) {
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
}
