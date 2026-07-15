package com.mva.mwtool.devops.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.GitHubAuthService;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.PrDto;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
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
            String decoded = new String(Base64.getMimeDecoder().decode(content), StandardCharsets.UTF_8);
            return new RepoFileDto(
                    body.path("path").asText(),
                    decoded,
                    body.path("sha").asText()
            );
        }
        return null;
    }

    @Override
    public List<String> listFilePaths(String repoId, String directoryPath, String branch) {
        String url = String.format("%s/repos/%s/%s/contents/%s?ref=%s",
                BASE_URL, organization, repoId, directoryPath, branch);

        HttpEntity<Void> entity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);

        JsonNode body = response.getBody();
        List<String> filePaths = new ArrayList<>();

        if (body == null) {
            return filePaths;
        }

        if (body.isArray()) {
            for (JsonNode item : body) {
                if ("file".equalsIgnoreCase(item.path("type").asText())) {
                    filePaths.add(item.path("path").asText());
                }
            }
            return filePaths;
        }

        if ("file".equalsIgnoreCase(body.path("type").asText())) {
            filePaths.add(body.path("path").asText());
        }

        return filePaths;
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

    @Override
    public void deleteFile(String repoId, String filePath, String branch, String commitMessage) {
        String sha = getCurrentFileSha(repoId, filePath, branch);
        if (sha == null || sha.isBlank()) {
            throw new IllegalArgumentException("Could not resolve current file version");
        }

        String url = String.format("%s/repos/%s/%s/contents/%s",
                BASE_URL, organization, repoId, filePath);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("message", commitMessage);
        requestBody.put("sha", sha);
        requestBody.put("branch", branch);

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
        restTemplate.exchange(url, HttpMethod.DELETE, entity, JsonNode.class);
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

    @Override
    public void createBranch(String repoId, String newBranch, String sourceBranch) {
        // Get the SHA of the source branch
        String url = String.format("%s/repos/%s/%s/git/ref/heads/%s",
                BASE_URL, organization, repoId, sourceBranch);
        HttpEntity<Void> getEntity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, getEntity, JsonNode.class);
        String sha = response.getBody().path("object").path("sha").asText();

        // Create the new branch ref
        String createUrl = String.format("%s/repos/%s/%s/git/refs", BASE_URL, organization, repoId);
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("ref", "refs/heads/" + newBranch);
        requestBody.put("sha", sha);

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
        restTemplate.exchange(createUrl, HttpMethod.POST, entity, JsonNode.class);
    }
}
