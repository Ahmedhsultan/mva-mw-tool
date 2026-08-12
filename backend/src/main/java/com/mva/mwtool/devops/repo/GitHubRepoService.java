package com.mva.mwtool.devops.repo;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.GitHubAuthService;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.PrDto;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.*;
import org.springframework.web.client.HttpClientErrorException;
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

    private String normalizeBranch(String branch) {
        if (branch == null) return "";
        if (branch.startsWith("refs/heads/")) {
            return branch.substring("refs/heads/".length());
        }
        return branch;
    }

    @Override
    public RepoFileDto pullFile(String repoId, String filePath, String branch) {
        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/contents/%s?ref=%s",
                BASE_URL, repo[0], repo[1], filePath, branch);

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
        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/contents/%s?ref=%s",
                BASE_URL, repo[0], repo[1], directoryPath, branch);

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
        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/contents/%s",
                BASE_URL, repo[0], repo[1], filePath);

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

        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/contents/%s",
                BASE_URL, repo[0], repo[1], filePath);

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
            String[] repo = parseRepoId(repoId);
            String url = String.format("%s/repos/%s/%s/contents/%s?ref=%s",
                    BASE_URL, repo[0], repo[1], filePath, branch);
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
        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/pulls", BASE_URL, repo[0], repo[1]);

        // GitHub expects simple branch names for head/base (not full ref names like refs/heads/feature)
        String head = normalizeBranch(sourceBranch);
        String base = normalizeBranch(targetBranch);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("head", head);
        requestBody.put("base", base);
        requestBody.put("title", title != null ? title : sourceBranch + " → " + targetBranch);
        requestBody.put("body", description != null ? description : "Created via MVA-MW-Tool");

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        try {
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
        } catch (HttpClientErrorException ex) {
            String resp = ex.getResponseBodyAsString();
            String msg = String.format("GitHub create PR failed: %s %s - url=%s body=%s response=%s",
                    ex.getStatusCode(), ex.getStatusText(), url, requestBody.toString(), resp);
            throw new RuntimeException(msg, ex);
        }
    }

    @Override
    public void createBranch(String repoId, String newBranch, String sourceBranch) {
        // Get the SHA of the source branch
        String src = normalizeBranch(sourceBranch);
        String[] repo = parseRepoId(repoId);
        String url = String.format("%s/repos/%s/%s/git/ref/heads/%s",
            BASE_URL, repo[0], repo[1], src);
        HttpEntity<Void> getEntity = new HttpEntity<>(GitHubAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, getEntity, JsonNode.class);
        String sha = response.getBody().path("object").path("sha").asText();

        // Create the new branch ref
        String createUrl = String.format("%s/repos/%s/%s/git/refs", BASE_URL, repo[0], repo[1]);
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("ref", "refs/heads/" + normalizeBranch(newBranch));
        requestBody.put("sha", sha);

        HttpHeaders headers = GitHubAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
        restTemplate.exchange(createUrl, HttpMethod.POST, entity, JsonNode.class);
    }
}
