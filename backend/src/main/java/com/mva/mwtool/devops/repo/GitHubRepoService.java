package com.mva.mwtool.devops.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.GitHubAuthService;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.PrDto;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

public class GitHubRepoService implements RepoService {

    private static final String BASE_URL = "https://api.github.com";

    private final RestTemplate restTemplate;
    private final String pat;
    private final String organization;

    public GitHubRepoService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("github");
        this.organization = credentials.getOrganization("github");
    }

    @Override
    public RepoFileDto pullFile(String repoId, String filePath, String branch) {
        String url = String.format("%s/repos/%s/%s/contents/%s?ref=%s",
                BASE_URL, organization, repoId, filePath, branch);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        JsonNode body = response.getBody();
        if (body != null) {
            String content = body.path("content").asText("");
            String decoded = new String(Base64.getMimeDecoder().decode(content));
            return new RepoFileDto(
                    body.path("path").asText(),
                    decoded,
                    body.path("sha").asText()
            );
        }
        return null;
    }

    @Override
    public void pushFile(String repoId, String filePath, String branch, String content, String commitMessage) {
        String url = String.format("%s/repos/%s/%s/contents/%s",
                BASE_URL, organization, repoId, filePath);

        String sha = getCurrentFileSha(repoId, filePath, branch);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("message", commitMessage);
        requestBody.put("content", Base64.getEncoder().encodeToString(content.getBytes()));
        requestBody.put("branch", branch);
        if (sha != null) {
            requestBody.put("sha", sha);
        }

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        restTemplate.exchange(url, HttpMethod.PUT, entity, JsonNode.class);
    }

    private String getCurrentFileSha(String repoId, String filePath, String branch) {
        try {
            String url = String.format("%s/repos/%s/%s/contents/%s?ref=%s",
                    BASE_URL, organization, repoId, filePath, branch);
            HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
            ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);
            JsonNode body = response.getBody();
            if (body != null) {
                return body.path("sha").asText();
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    @Override
    public PrDto createPullRequest(String repoId, String sourceBranch, String targetBranch, String title, String description) {
        String url = String.format("%s/repos/%s/%s/pulls", BASE_URL, organization, repoId);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("head", sourceBranch);
        requestBody.put("base", targetBranch);
        requestBody.put("title", title != null ? title : sourceBranch + " → " + targetBranch);
        requestBody.put("body", description != null ? description : "Created via MVA-MW-Tool");

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
        JsonNode body = response.getBody();

        PrDto dto = new PrDto();
        if (body != null) {
            dto.setId(body.path("number").asText());
            dto.setTitle(body.path("title").asText());
            dto.setStatus(body.path("state").asText());
            dto.setUrl(body.path("html_url").asText());
        }
        return dto;
    }
}
