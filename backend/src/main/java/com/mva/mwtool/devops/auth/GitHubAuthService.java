package com.mva.mwtool.devops.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.dto.AuthResponse;
import com.mva.mwtool.dto.DevOpsCredentials;
import org.springframework.http.*;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

public class GitHubAuthService implements AuthService {

    private final RestTemplate restTemplate;
    private final String pat;

    public GitHubAuthService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("github");
    }

    @Override
    public AuthResponse validateToken() {
        String url = "https://api.github.com/user";

        HttpHeaders headers = createHeaders(pat);
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(
                    url, HttpMethod.GET, entity, JsonNode.class);

            JsonNode body = response.getBody();
            if (body != null) {
                String displayName = body.path("name").asText(body.path("login").asText());
                String email = body.path("email").asText("");
                return new AuthResponse(true, displayName, email);
            }
            return new AuthResponse(false, null, null);
        } catch (HttpClientErrorException.Unauthorized e) {
            return new AuthResponse(false, null, null);
        }
    }

    public static HttpHeaders createHeaders(String pat) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + pat);
        headers.set("Accept", "application/vnd.github+json");
        headers.set("X-GitHub-Api-Version", "2022-11-28");
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}
