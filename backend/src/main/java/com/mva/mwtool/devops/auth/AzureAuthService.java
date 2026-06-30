package com.mva.mwtool.devops.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.dto.AuthResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Base64;

@Service("azureAuthService")
public class AzureAuthService implements AuthService {

    private static final Logger log = LoggerFactory.getLogger(AzureAuthService.class);
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AzureAuthService(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @Override
    public AuthResponse validateToken(String pat, String organization, String project) {
        // Use connectionData endpoint — works with any PAT scope
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
                return new AuthResponse(true, displayName, email);
            }
            return new AuthResponse(false, null, null);
        } catch (Exception e) {
            log.error("Azure auth validation failed: {} - {}", e.getClass().getSimpleName(), e.getMessage());
            return new AuthResponse(false, null, null);
        }
    }

    public static HttpHeaders createHeaders(String pat) {
        HttpHeaders headers = new HttpHeaders();
        String credentials = Base64.getEncoder().encodeToString((":" + pat).getBytes());
        headers.set("Authorization", "Basic " + credentials);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}
