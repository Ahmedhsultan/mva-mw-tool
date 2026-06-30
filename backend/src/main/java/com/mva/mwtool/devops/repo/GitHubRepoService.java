package com.mva.mwtool.devops.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.GitHubAuthService;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service("githubRepoService")
public class GitHubRepoService implements RepoService {

    private static final String BASE_URL = "https://api.github.com";

    private final RestTemplate restTemplate;

    public GitHubRepoService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public RepoFileDto pullFile(String pat, String organization, String project,
                                String repoId, String filePath, String branch) {
        String url = String.format("%s/repos/%s/%s/contents/%s?ref=%s",
                BASE_URL, organization, repoId, filePath, branch);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        JsonNode body = response.getBody();
        if (body != null) {
            String content = body.path("content").asText("");
            // GitHub returns base64 encoded content
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
    public void pushFile(String pat, String organization, String project,
                         String repoId, String filePath, String branch,
                         String content, String commitMessage) {
        String url = String.format("%s/repos/%s/%s/contents/%s",
                BASE_URL, organization, repoId, filePath);

        // Get current file SHA first
        String sha = getCurrentFileSha(pat, organization, repoId, filePath, branch);

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

    private String getCurrentFileSha(String pat, String organization, String repoId,
                                     String filePath, String branch) {
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
            // File does not exist yet, will be created
        }
        return null;
    }
}
