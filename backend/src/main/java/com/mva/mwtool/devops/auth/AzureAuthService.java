package com.mva.mwtool.devops.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.dto.AuthResponse;
import com.mva.mwtool.dto.DevOpsCredentials;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.Base64;
import java.util.List;

public class AzureAuthService implements AuthService {

    private static final Logger log = LoggerFactory.getLogger(AzureAuthService.class);
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String pat;
    private final String organization;

    public AzureAuthService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("azure");
        this.organization = credentials.getOrganization("azure");
    }

    @Override
    public AuthResponse validateToken() {
        String url = String.format("https://dev.azure.com/%s/_apis/connectionData", organization);

        HttpHeaders headers = createHeaders(pat);
        headers.set("Accept", "application/json");
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    url, HttpMethod.GET, entity, String.class);

            log.info("Azure auth response status: {}", response.getStatusCode());

            String rawBody = response.getBody();
            if (rawBody != null && !rawBody.isBlank()) {
                JsonNode body = objectMapper.readTree(rawBody);
                String displayName = body.path("authenticatedUser")
                        .path("providerDisplayName").asText("");
                String email = body.path("authenticatedUser")
                        .path("properties").path("Account").path("$value").asText("");
                if (displayName.isEmpty()) {
                    displayName = body.path("authorizedUser")
                            .path("providerDisplayName").asText("User");
                }
                String userId = body.path("authenticatedUser")
                        .path("id").asText("");
                String avatarUrl = "";
                if (!userId.isEmpty()) {
                    avatarUrl = fetchAvatarDataUrl(userId);
                }
                return new AuthResponse(true, displayName, email, avatarUrl);
            }
            return new AuthResponse(false, null, null, null);
        } catch (Exception e) {
            log.error("Azure auth validation failed: {} - {}", e.getClass().getSimpleName(), e.getMessage());
            return new AuthResponse(false, null, null, null);
        }
    }

    public static HttpHeaders createHeaders(String pat) {
        HttpHeaders headers = new HttpHeaders();
        String credentials = Base64.getEncoder().encodeToString((":" + pat).getBytes());
        headers.set("Authorization", "Basic " + credentials);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }

    private String fetchAvatarDataUrl(String userId) {
        String avatarEndpoint = String.format(
            "https://dev.azure.com/%s/_api/_common/identityImage?id=%s&size=2",
            organization,
            userId
        );

        try {
            HttpHeaders headers = createHeaders(pat);
            headers.setAccept(List.of(MediaType.IMAGE_PNG, MediaType.ALL));
            HttpEntity<Void> entity = new HttpEntity<>(headers);

            ResponseEntity<byte[]> response = restTemplate.exchange(
                avatarEndpoint,
                HttpMethod.GET,
                entity,
                byte[].class
            );

            byte[] body = response.getBody();
            if (body == null || body.length == 0) {
                return "";
            }

            MediaType contentType = response.getHeaders().getContentType();
            String mediaType = contentType != null ? contentType.toString() : MediaType.IMAGE_PNG_VALUE;
            String base64Image = Base64.getEncoder().encodeToString(body);
            return "data:" + mediaType + ";base64," + base64Image;
        } catch (Exception exception) {
            log.warn("Azure avatar fetch failed: {} - {}", exception.getClass().getSimpleName(), exception.getMessage());
            return "";
        }
    }
}
