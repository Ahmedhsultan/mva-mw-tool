package com.mva.mwtool.devops.deploy;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.auth.AzureAuthService;
import com.mva.mwtool.dto.DeployDto;
import com.mva.mwtool.dto.DevOpsCredentials;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.util.*;

public class AzureDeployService implements DeployService {

    private static final Logger log = LoggerFactory.getLogger(AzureDeployService.class);

    private static final String BASE_URL = "https://vsrm.dev.azure.com";
    private static final String API_VERSION = "7.1";
    /** Environment-level PATCH needs the preview API */
    private static final String ENV_API_VERSION = "7.2-preview.8";

    /** Maps environment status integers to readable names */
    private static final Map<Integer, String> STATUS_NAMES = Map.ofEntries(
            Map.entry(0, "undefined"), Map.entry(1, "notStarted"), Map.entry(2, "inProgress"),
            Map.entry(3, "partiallySucceeded"), Map.entry(4, "succeeded"), Map.entry(5, "rejected"),
            Map.entry(6, "canceled"), Map.entry(7, "queued"), Map.entry(8, "rejected"),
            Map.entry(16, "rejected"), Map.entry(32, "canceled"), Map.entry(64, "scheduled"), Map.entry(128, "pending")
    );

    /** Maps environment status strings to integers */
    private static final Map<String, Integer> STATUS_INTS = Map.ofEntries(
            Map.entry("undefined", 0), Map.entry("notStarted", 1), Map.entry("inProgress", 2),
            Map.entry("partiallySucceeded", 3), Map.entry("succeeded", 4), Map.entry("rejected", 5),
            Map.entry("canceled", 6), Map.entry("queued", 7), Map.entry("scheduled", 64), Map.entry("pending", 128)
    );

    private static final Set<Integer> IN_PROGRESS_STATUSES = Set.of(0, 1, 2, 7, 64, 128);

    private final RestTemplate restTemplate;
    private final String pat;
    private final String organization;
    private final String project;

    public AzureDeployService(RestTemplate restTemplate, DevOpsCredentials credentials) {
        this.restTemplate = restTemplate;
        this.pat = credentials.getPat("azure");
        this.organization = credentials.getOrganization("azure");
        this.project = credentials.getProject("azure");
    }

    // ── Public API ───────────────────────────────────────────

    @Override
    public DeployDto getDeployById(String deployId, String environment) {
        String url = String.format("%s/%s/%s/_apis/release/releases/%s?$expand=none&api-version=%s",
                BASE_URL, organization, project, deployId, ENV_API_VERSION);

        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);
        JsonNode releaseNode = response.getBody();

        // Auto-approve any pending approvals each time we poll
        if (releaseNode != null && environment != null) {
            int releaseId = releaseNode.path("id").asInt();
            approveAllForEnvironment(releaseId, environment);
        }

        return mapToDeployDto(releaseNode, environment);
    }

    @Override
    public DeployDto createDeploy(String buildId, String definitionId, String environment, String description) {
        // 1. Fetch the release definition (artifacts + all environments)
        JsonNode releaseDef = fetchReleaseDefinition(definitionId);
        if (releaseDef == null) {
            throw new RuntimeException("Release definition " + definitionId + " not found");
        }

        // 2. Collect ALL environment names for manualEnvironments
        List<String> allEnvNames = new ArrayList<>();
        if (releaseDef.has("environments") && releaseDef.get("environments").isArray()) {
            for (JsonNode e : releaseDef.get("environments")) {
                allEnvNames.add(e.get("name").asText());
            }
        }

        // 3. Resolve artifact alias
        String artifactAlias = "_build";
        if (releaseDef.has("artifacts") && releaseDef.get("artifacts").isArray()
                && !releaseDef.get("artifacts").isEmpty()) {
            artifactAlias = releaseDef.get("artifacts").get(0).path("alias").asText("_build");
        }

        // 4. Build create-release body
        String url = String.format("%s/%s/%s/_apis/release/releases?api-version=%s",
                BASE_URL, organization, project, API_VERSION);

        Map<String, Object> requestBody = new LinkedHashMap<>();
        requestBody.put("definitionId", Integer.parseInt(definitionId));
        requestBody.put("description", description != null ? description : "Triggered via MVA-MW-Tool");
        requestBody.put("isDraft", false);
        requestBody.put("reason", "manual");
        // KEY FIX: set ALL environments as manual so none auto-deploy
        requestBody.put("manualEnvironments", allEnvNames);

        Map<String, Object> artifact = new HashMap<>();
        artifact.put("alias", artifactAlias);
        Map<String, Object> instanceRef = new HashMap<>();
        instanceRef.put("id", buildId);
        instanceRef.put("name", null);
        artifact.put("instanceReference", instanceRef);
        requestBody.put("artifacts", List.of(artifact));

        HttpHeaders headers = AzureAuthService.createHeaders(pat);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        JsonNode releaseNode;
        try {
            ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.POST, entity, JsonNode.class);
            releaseNode = response.getBody();
        } catch (Exception e) {
            log.error("Failed to create release: {}", e.getMessage());
            // Fallback: find existing release for this definition
            releaseNode = findLatestRelease(Integer.parseInt(definitionId), buildId);
            if (releaseNode == null) {
                throw new RuntimeException("Failed to create release and no existing release found: " + e.getMessage());
            }
            log.info("Using existing release #{}", releaseNode.path("id").asInt());
        }

        // 5. Approve + trigger the target environment
        if (releaseNode != null && environment != null && !environment.isBlank()) {
            int releaseId = releaseNode.path("id").asInt();
            approveAllForEnvironment(releaseId, environment);
            boolean triggered = triggerEnvironment(releaseNode, environment);

            // Retry: approve again then re-trigger
            if (!triggered) {
                log.info("First trigger attempt failed for release #{}, retrying...", releaseId);
                sleep(2000);
                approveAllForEnvironment(releaseId, environment);
                sleep(1000);
                triggerEnvironment(releaseNode, environment);
            }
        }

        return mapToDeployDto(releaseNode, environment);
    }

    // ── Release definition ───────────────────────────────────

    private JsonNode fetchReleaseDefinition(String definitionId) {
        String url = String.format("%s/%s/%s/_apis/release/definitions/%s?api-version=%s",
                BASE_URL, organization, project, definitionId, API_VERSION);
        HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
        ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);
        return response.getBody();
    }

    // ── Trigger environment ──────────────────────────────────

    private boolean triggerEnvironment(JsonNode releaseNode, String targetEnvironment) {
        String releaseId = releaseNode.path("id").asText();
        JsonNode environments = releaseNode.get("environments");
        if (environments == null || !environments.isArray()) return false;

        JsonNode envNode = findEnvironment(environments, targetEnvironment);
        if (envNode == null) {
            log.warn("Environment '{}' not found in release #{}", targetEnvironment, releaseId);
            return false;
        }

        String envId = envNode.path("id").asText();
        String url = String.format("%s/%s/%s/_apis/release/releases/%s/environments/%s?api-version=%s",
                BASE_URL, organization, project, releaseId, envId, ENV_API_VERSION);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "inProgress");
        body.put("comment", "Triggered via MVA-MW-Tool for " + targetEnvironment);

        HttpHeaders headers = AzureAuthService.createHeaders(pat);
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            restTemplate.exchange(url, HttpMethod.PATCH, entity, JsonNode.class);
            log.info("Triggered environment '{}' (id={}) on release #{}", targetEnvironment, envId, releaseId);
            return true;
        } catch (Exception e) {
            log.error("Failed to trigger environment '{}' on release #{}: {}", targetEnvironment, releaseId, e.getMessage());
            return false;
        }
    }

    // ── Auto-approve pending approvals ───────────────────────

    private int approveAllForEnvironment(int releaseId, String environmentName) {
        try {
            String url = String.format("%s/%s/%s/_apis/release/approvals?releaseIdsFilter=%d&statusFilter=pending&api-version=%s",
                    BASE_URL, organization, project, releaseId, API_VERSION);

            HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
            ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);
            JsonNode data = response.getBody();
            if (data == null || !data.has("value")) return 0;

            // Collect approvals matching the target environment exactly
            List<JsonNode> pending = new ArrayList<>();
            for (JsonNode a : data.get("value")) {
                String envName = a.path("releaseEnvironment").path("name").asText("");
                if (envName.equalsIgnoreCase(environmentName)) {
                    pending.add(a);
                }
            }
            if (pending.isEmpty()) {
                log.warn("No pending approvals matched environment '{}' on release #{}", environmentName, releaseId);
                return 0;
            }

            int approved = 0;
            HttpHeaders headers = AzureAuthService.createHeaders(pat);
            headers.setContentType(MediaType.APPLICATION_JSON);

            for (JsonNode a : pending) {
                int approvalId = a.get("id").asInt();
                Map<String, Object> approvalBody = new LinkedHashMap<>();
                approvalBody.put("status", "approved");
                approvalBody.put("comments", "Auto-approved by MVA MW Tool");

                String approveUrl = String.format("%s/%s/%s/_apis/release/approvals/%d?api-version=%s",
                        BASE_URL, organization, project, approvalId, API_VERSION);
                HttpEntity<Map<String, Object>> approveEntity = new HttpEntity<>(approvalBody, headers);

                try {
                    restTemplate.exchange(approveUrl, HttpMethod.PATCH, approveEntity, JsonNode.class);
                    approved++;
                    log.info("Approved deployment #{} for release #{}", approvalId, releaseId);
                } catch (Exception e) {
                    log.error("Failed to approve #{}: {}", approvalId, e.getMessage());
                }
            }
            return approved;
        } catch (Exception e) {
            log.error("Failed to fetch approvals for release #{}: {}", releaseId, e.getMessage());
            return 0;
        }
    }

    // ── Fallback: find latest existing release ───────────────

    private JsonNode findLatestRelease(int definitionId, String buildId) {
        try {
            String url = String.format("%s/%s/%s/_apis/release/releases?definitionId=%d&$top=5&$expand=environments&api-version=%s",
                    BASE_URL, organization, project, definitionId, API_VERSION);
            HttpEntity<Void> entity = new HttpEntity<>(AzureAuthService.createHeaders(pat));
            ResponseEntity<JsonNode> response = restTemplate.exchange(url, HttpMethod.GET, entity, JsonNode.class);
            JsonNode data = response.getBody();
            if (data == null || !data.has("value") || data.get("value").isEmpty()) return null;

            // Prefer a release using the same build
            for (JsonNode release : data.get("value")) {
                if (release.has("artifacts")) {
                    for (JsonNode artifact : release.get("artifacts")) {
                        String artBuildId = artifact.path("definitionReference").path("version").path("id").asText("");
                        if (buildId.equals(artBuildId)) {
                            return release;
                        }
                    }
                }
            }
            return data.get("value").get(0);
        } catch (Exception e) {
            log.error("findLatestRelease failed: {}", e.getMessage());
            return null;
        }
    }

    // ── Status mapping ───────────────────────────────────────

    private DeployDto mapToDeployDto(JsonNode node, String targetEnvironment) {
        if (node == null) return null;
        DeployDto dto = new DeployDto();
        dto.setId(node.path("id").asText());
        dto.setName(node.path("name").asText());
        dto.setUrl(node.path("_links").path("web").path("href").asText());

        List<String> artifacts = new ArrayList<>();
        if (node.has("artifacts")) {
            for (JsonNode art : node.get("artifacts")) {
                artifacts.add(art.path("alias").asText());
            }
        }
        dto.setArtifacts(artifacts);

        if (node.has("environments") && node.get("environments").isArray()
                && !node.get("environments").isEmpty()) {
            JsonNode envNode = findEnvironment(node.get("environments"), targetEnvironment);
            dto.setEnvironment(envNode.path("name").asText());
            // Handle status as both integer and string
            dto.setStatus(resolveEnvStatus(envNode));
        } else {
            dto.setStatus(node.path("status").asText());
        }

        return dto;
    }

    /**
     * Azure DevOps can return environment status as integer OR string.
     * Normalise to a readable string name.
     */
    private String resolveEnvStatus(JsonNode envNode) {
        JsonNode statusNode = envNode.path("status");
        if (statusNode.isNumber()) {
            int num = statusNode.asInt();
            return STATUS_NAMES.getOrDefault(num, "unknown(" + num + ")");
        }
        return statusNode.asText("notStarted");
    }

    // ── Environment lookup (exact, case-insensitive) ─────────────────────

    private JsonNode findEnvironment(JsonNode environments, String targetEnvironment) {
        if (targetEnvironment != null && !targetEnvironment.isBlank()) {
            String targetLower = targetEnvironment.toLowerCase();

            for (JsonNode env : environments) {
                if (targetLower.equals(env.path("name").asText("").toLowerCase())) {
                    return env;
                }
            }
            List<String> available = new ArrayList<>();
            for (JsonNode env : environments) {
                available.add(env.path("name").asText(""));
            }
            throw new IllegalArgumentException("Environment '" + targetEnvironment + "' not found. Available environments: " + available);
        }
        return environments.get(0);
    }

    private void sleep(long ms) {
        try { Thread.sleep(ms); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }
}
