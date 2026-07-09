package com.mvax.mwtools.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.mvax.mwtools.dto.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.ExchangeStrategies;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/**
 * Azure DevOps API service — mirrors the Angular AzureDevOpsService.
 * All Azure DevOps HTTP calls happen here (server-side) so the PAT
 * never needs to be used from the browser.
 */
@Service
public class AzureDevOpsService {

    private static final Logger log = LoggerFactory.getLogger(AzureDevOpsService.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private final WebClient webClient = WebClient.builder()
            .exchangeStrategies(ExchangeStrategies.builder()
                    .codecs(cfg -> cfg.defaultCodecs().maxInMemorySize(50 * 1024 * 1024)) // 50 MB
                    .build())
            .build();

    // ── Release status maps ──────────────────────────────────

    private static final Map<String, Integer> RELEASE_STATUS_STRING_MAP = Map.ofEntries(
            Map.entry("undefined", 0), Map.entry("notStarted", 1), Map.entry("inProgress", 2),
            Map.entry("partiallySucceeded", 3), Map.entry("succeeded", 4), Map.entry("rejected", 5),
            Map.entry("canceled", 6), Map.entry("queued", 7), Map.entry("scheduled", 64), Map.entry("pending", 128)
    );

    private static final Map<Integer, String> RELEASE_STATUS_NAMES = Map.ofEntries(
            Map.entry(0, "undefined"), Map.entry(1, "notStarted"), Map.entry(2, "inProgress"),
            Map.entry(3, "partiallySucceeded"), Map.entry(4, "succeeded"), Map.entry(5, "rejected"),
            Map.entry(6, "canceled"), Map.entry(7, "queued"), Map.entry(8, "rejected"),
            Map.entry(16, "rejected"), Map.entry(32, "canceled"), Map.entry(64, "scheduled"), Map.entry(128, "pending")
    );

    private static final Set<Integer> RELEASE_IN_PROGRESS = Set.of(0, 1, 2, 7, 64, 128);

    // ── Helpers ──────────────────────────────────────────────

    private String baseUrl(PatConfig pat) {
        return "https://dev.azure.com/" + pat.organization() + "/" + pat.project();
    }

    private String vsrmBaseUrl(PatConfig pat) {
        return "https://vsrm.dev.azure.com/" + pat.organization() + "/" + pat.project();
    }

    private String authHeader(PatConfig pat) {
        return "Basic " + Base64.getEncoder().encodeToString((":" + pat.pat()).getBytes());
    }

    private JsonNode getJson(PatConfig pat, String url) {
        try {
            String body = webClient.get()
                    .uri(url)
                    .header("Authorization", authHeader(pat))
                    .header("Content-Type", "application/json")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
            return mapper.readTree(body);
        } catch (Exception e) {
            log.error("GET {} failed: {}", url, e.getMessage());
            return null;
        }
    }

    /** Tracks the last error message from a failed HTTP call (for better diagnostics). */
    private final ThreadLocal<String> lastHttpError = new ThreadLocal<>();

    private JsonNode postJson(PatConfig pat, String url, Object body) {
        lastHttpError.remove();
        try {
            String jsonBody = body instanceof String ? (String) body : mapper.writeValueAsString(body);
            String response = webClient.post()
                    .uri(url)
                    .header("Authorization", authHeader(pat))
                    .header("Content-Type", "application/json")
                    .bodyValue(jsonBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
            return mapper.readTree(response);
        } catch (WebClientResponseException e) {
            String errBody = e.getResponseBodyAsString();
            log.error("POST {} failed with {}: {}", url, e.getStatusCode(), errBody);
            lastHttpError.set(errBody);
            return null;
        } catch (Exception e) {
            log.error("POST {} failed: {}", url, e.getMessage());
            lastHttpError.set(e.getMessage());
            return null;
        }
    }

    private JsonNode patchJson(PatConfig pat, String url, Object body) {
        try {
            String jsonBody = body instanceof String ? (String) body : mapper.writeValueAsString(body);
            String response = webClient.patch()
                    .uri(url)
                    .header("Authorization", authHeader(pat))
                    .header("Content-Type", "application/json")
                    .bodyValue(jsonBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
            return mapper.readTree(response);
        } catch (Exception e) {
            log.error("PATCH {} failed: {}", url, e.getMessage());
            return null;
        }
    }

    private JsonNode findEnvByName(JsonNode environments, String name) {
        if (environments == null || !environments.isArray()) return null;
        for (JsonNode env : environments) {
            String envName = env.has("name") ? env.get("name").asText("") : "";
            if (envName.toLowerCase().contains(name.toLowerCase())) return env;
        }
        return null;
    }

    // ── PAT Validation ───────────────────────────────────────

    public ApiResult validatePat(PatConfig pat) {
        try {
            String url = "https://dev.azure.com/" + pat.organization() + "/_apis/projects?$top=1&api-version=7.1";
            JsonNode data = getJson(pat, url);
            if (data == null) {
                return ApiResult.fail("Authentication failed — cannot reach Azure DevOps");
            }
            if (!data.has("count") && !data.has("value")) {
                return ApiResult.fail("Unexpected API response — PAT may lack required permissions");
            }
            return ApiResult.ok("PAT verified — Azure DevOps access confirmed");
        } catch (Exception e) {
            return ApiResult.fail("Connection error: " + e.getMessage());
        }
    }

    // ── Repository helpers ───────────────────────────────────

    private String getRepoId(PatConfig pat, String repo) {
        String url = baseUrl(pat) + "/_apis/git/repositories/" + repo + "?api-version=7.1";
        JsonNode data = getJson(pat, url);
        if (data != null && data.has("id")) return data.get("id").asText();
        return null;
    }

    // ── Create Branch ────────────────────────────────────────

    public ApiResult createBranch(PatConfig pat, String repo, String releaseNumber, String branchName) {
        String targetBranch = branchName != null ? branchName : "release/primary/" + releaseNumber;
        String baseBranch = "mvax-common".equals(repo) ? "develop" : "release/develop";

        try {
            // 1. Get base branch ref
            String refsUrl = baseUrl(pat) + "/_apis/git/repositories/" + repo
                    + "/refs?filter=heads/" + baseBranch + "&api-version=7.1";
            JsonNode refsData = getJson(pat, refsUrl);
            if (refsData == null || !refsData.has("value") || refsData.get("value").isEmpty()) {
                return ApiResult.fail("Branch " + baseBranch + " not found");
            }
            String sourceObjectId = refsData.get("value").get(0).get("objectId").asText();

            // 2. Create new branch
            ArrayNode body = mapper.createArrayNode();
            ObjectNode ref = mapper.createObjectNode();
            ref.put("name", "refs/heads/" + targetBranch);
            ref.put("oldObjectId", "0000000000000000000000000000000000000000");
            ref.put("newObjectId", sourceObjectId);
            body.add(ref);

            String createUrl = baseUrl(pat) + "/_apis/git/repositories/" + repo + "/refs?api-version=7.1";
            JsonNode result = postJson(pat, createUrl, body);
            if (result == null) return ApiResult.fail("Failed to create branch");

            JsonNode firstResult = result.has("value") && !result.get("value").isEmpty()
                    ? result.get("value").get(0) : null;
            if (firstResult != null && firstResult.has("success") && !firstResult.get("success").asBoolean()) {
                String msg = firstResult.has("customMessage") ? firstResult.get("customMessage").asText() : "Branch creation failed";
                return ApiResult.fail(msg);
            }
            return ApiResult.ok("Branch " + targetBranch + " created");
        } catch (Exception e) {
            return ApiResult.fail(e.getMessage());
        }
    }

    // ── Check Branch Exists ──────────────────────────────────

    public BranchCheckResult checkBranchExists(PatConfig pat, String repo, String releaseNumber, String branchName) {
        String targetBranch = branchName != null ? branchName : "release/primary/" + releaseNumber;
        try {
            String url = baseUrl(pat) + "/_apis/git/repositories/" + repo
                    + "/refs?filter=heads/" + targetBranch + "&api-version=7.1";
            JsonNode data = getJson(pat, url);
            if (data != null && data.has("value") && !data.get("value").isEmpty()) {
                return new BranchCheckResult(true, "Branch " + targetBranch + " already exists", null, null);
            }
            return new BranchCheckResult(false, "Branch " + targetBranch + " not found", null, null);
        } catch (Exception e) {
            return new BranchCheckResult(false, e.getMessage(), null, null);
        }
    }

    // ── Create Pull Request ──────────────────────────────────

    public PrResult createPullRequest(PatConfig pat, String repo, String releaseNumber, String branchName) {
        String sourceBranch = branchName != null ? branchName : "release/primary/" + releaseNumber;
        try {
            ObjectNode body = mapper.createObjectNode();
            body.put("sourceRefName", "refs/heads/" + sourceBranch);
            body.put("targetRefName", "refs/heads/master");
            body.put("title", "Release " + releaseNumber + " – " + repo);
            body.put("description", "Automated PR for release " + releaseNumber + " from " + sourceBranch + " to master.");

            String url = baseUrl(pat) + "/_apis/git/repositories/" + repo + "/pullrequests?api-version=7.1";
            JsonNode data = postJson(pat, url, body);
            if (data == null) return new PrResult(false, "Failed to create PR", null, null);

            int prId = data.get("pullRequestId").asInt();
            String prUrl = baseUrl(pat) + "/_git/" + repo + "/pullrequest/" + prId;
            return new PrResult(true, "PR #" + prId + " created", prUrl, prId);
        } catch (Exception e) {
            return new PrResult(false, e.getMessage(), null, null);
        }
    }

    // ── Find Existing PR ─────────────────────────────────────

    public BranchCheckResult findExistingPR(PatConfig pat, String repo, String releaseNumber, String branchName) {
        String sourceBranch = branchName != null ? branchName : "release/primary/" + releaseNumber;
        try {
            String sourceRef = "refs/heads/" + sourceBranch;
            String url = baseUrl(pat) + "/_apis/git/repositories/" + repo
                    + "/pullrequests?searchCriteria.sourceRefName=" + sourceRef
                    + "&searchCriteria.targetRefName=refs/heads/master"
                    + "&searchCriteria.status=all&api-version=7.1";
            JsonNode data = getJson(pat, url);
            if (data != null && data.has("value") && !data.get("value").isEmpty()) {
                JsonNode pr = data.get("value").get(0);
                int prId = pr.get("pullRequestId").asInt();
                String prUrl = baseUrl(pat) + "/_git/" + repo + "/pullrequest/" + prId;
                return new BranchCheckResult(true, "PR #" + prId + " already exists", prUrl, prId);
            }
            return new BranchCheckResult(false, "No existing PR found", null, null);
        } catch (Exception e) {
            return new BranchCheckResult(false, e.getMessage(), null, null);
        }
    }

    // ── Queue Build ──────────────────────────────────────────

    public BuildResult queueBuild(PatConfig pat, String repo, String branch) {
        try {
            String repoId = getRepoId(pat, repo);
            if (repoId == null) return new BuildResult(false, "Repository \"" + repo + "\" not found", null, null);

            // Find build definition
            String defUrl = baseUrl(pat) + "/_apis/build/definitions?repositoryId=" + repoId
                    + "&repositoryType=TfsGit&api-version=7.1";
            JsonNode defData = getJson(pat, defUrl);
            if (defData == null || !defData.has("value") || defData.get("value").isEmpty()) {
                return new BuildResult(false, "No build definition found for " + repo, null, null);
            }
            int definitionId = defData.get("value").get(0).get("id").asInt();

            // Queue
            ObjectNode body = mapper.createObjectNode();
            body.putObject("definition").put("id", definitionId);
            body.put("sourceBranch", "refs/heads/" + branch);
            body.put("reason", "manual");

            String buildUrl = baseUrl(pat) + "/_apis/build/builds?api-version=7.1";
            JsonNode buildData = postJson(pat, buildUrl, body);
            if (buildData == null) return new BuildResult(false, "Failed to queue build", null, null);

            int buildId = buildData.get("id").asInt();
            String webUrl = buildData.has("_links") && buildData.get("_links").has("web")
                    ? buildData.get("_links").get("web").get("href").asText()
                    : baseUrl(pat) + "/_build/results?buildId=" + buildId;
            return new BuildResult(true, "Build #" + buildId + " queued", buildId, webUrl);
        } catch (Exception e) {
            return new BuildResult(false, e.getMessage(), null, null);
        }
    }

    // ── Cancel Build ────────────────────────────────────────

    /**
     * Cancel a queued or in-progress build by setting its status to "cancelling".
     */
    public ApiResult cancelBuild(PatConfig pat, int buildId) {
        try {
            String url = baseUrl(pat) + "/_apis/build/builds/" + buildId + "?api-version=7.1";
            ObjectNode body = mapper.createObjectNode();
            body.put("status", "cancelling");
            JsonNode result = patchJson(pat, url, body);
            if (result == null) return ApiResult.fail("Failed to cancel build #" + buildId);
            String status = result.has("status") ? result.get("status").asText() : "unknown";
            return ApiResult.ok("Build #" + buildId + " cancellation requested (status: " + status + ")");
        } catch (Exception e) {
            return ApiResult.fail("Cancel build #" + buildId + " failed: " + e.getMessage());
        }
    }

    // ── Check Build Status (single poll) ─────────────────────

    public BuildStatusResult checkBuildStatus(PatConfig pat, int buildId) {
        try {
            String url = baseUrl(pat) + "/_apis/build/builds/" + buildId + "?api-version=7.1";
            JsonNode data = getJson(pat, url);
            if (data == null) return new BuildStatusResult(true, false, "unknown", "noResponse");

            String status = data.get("status").asText();
            String result = data.has("result") ? data.get("result").asText() : null;
            if ("completed".equals(status)) {
                boolean success = "succeeded".equals(result) || "partiallySucceeded".equals(result);
                return new BuildStatusResult(true, success, status, result);
            }
            // Treat cancelling/postponed as terminal failures — don't poll indefinitely
            if ("cancelling".equals(status) || "postponed".equals(status)) {
                return new BuildStatusResult(true, false, status, result);
            }
            return new BuildStatusResult(false, false, status, null);
        } catch (Exception e) {
            return new BuildStatusResult(false, false, "error", null);
        }
    }

    // ── Wait for Build (blocking, with progress callback) ────

    public ApiResult waitForBuild(PatConfig pat, int buildId, Consumer<String> onProgress) {
        return waitForBuild(pat, buildId, onProgress, () -> false);
    }

    public ApiResult waitForBuild(PatConfig pat, int buildId, Consumer<String> onProgress, BooleanSupplier isCancelled) {
        int maxAttempts = 1080; // 90 min at 5s intervals
        for (int i = 0; i < maxAttempts; i++) {
            if (isCancelled.getAsBoolean()) return ApiResult.fail("Build #" + buildId + " cancelled");
            BuildStatusResult status = checkBuildStatus(pat, buildId);
            if (status.done()) {
                return status.success()
                        ? ApiResult.ok("Build #" + buildId + " " + status.result())
                        : ApiResult.fail("Build #" + buildId + " " + status.result());
            }
            if (onProgress != null) onProgress.accept("Build #" + buildId + ": " + status.status() + "...");
            sleep(5000);
        }
        return ApiResult.fail("Build #" + buildId + " timed out");
    }

    // ── Deploy (Create Release + Deploy to Environment) ──────

    public DeployResult deploy(PatConfig pat, int buildId, String environment, String repo) {
        try {
            // Find release definition
            String defUrl = vsrmBaseUrl(pat) + "/_apis/release/definitions?searchText=" + repo
                    + "&$expand=environments,artifacts&api-version=7.1";
            JsonNode defData = getJson(pat, defUrl);
            if (defData == null || !defData.has("value") || defData.get("value").isEmpty()) {
                return new DeployResult(false, "No release definition found for " + repo, null, null, null);
            }

            // Pick best matching definition
            String repoLower = repo.toLowerCase();
            JsonNode releaseDef = null;
            for (JsonNode d : defData.get("value")) {
                if (d.has("name") && d.get("name").asText("").toLowerCase().equals(repoLower)) {
                    releaseDef = d;
                    break;
                }
            }
            if (releaseDef == null) releaseDef = defData.get("value").get(0);

            // Get artifacts
            JsonNode artifacts = releaseDef.has("artifacts") ? releaseDef.get("artifacts") : mapper.createArrayNode();
            if (!artifacts.isArray() || artifacts.isEmpty()) {
                String fullDefUrl = vsrmBaseUrl(pat) + "/_apis/release/definitions/" + releaseDef.get("id").asInt() + "?api-version=7.1";
                JsonNode fullDef = getJson(pat, fullDefUrl);
                if (fullDef != null && fullDef.has("artifacts")) artifacts = fullDef.get("artifacts");
            }

            // Find target environment
            JsonNode envStage = findEnvByName(releaseDef.get("environments"), environment);
            if (envStage == null) {
                return new DeployResult(false, "Environment \"" + environment + "\" not found in release definition for " + repo,
                        null, null, null);
            }

            // Collect all env names for manual trigger
            List<String> allEnvNames = new ArrayList<>();
            for (JsonNode e : releaseDef.get("environments")) {
                allEnvNames.add(e.get("name").asText());
            }

            // Build release body
            ObjectNode body = mapper.createObjectNode();
            body.put("definitionId", releaseDef.get("id").asInt());
            body.put("description", "Automated release for " + repo + " to " + environment);
            body.put("isDraft", false);
            body.put("reason", "manual");
            ArrayNode manualEnvs = body.putArray("manualEnvironments");
            allEnvNames.forEach(manualEnvs::add);

            // Artifact overrides
            ArrayNode bodyArtifacts = body.putArray("artifacts");
            if (artifacts.isArray() && !artifacts.isEmpty()) {
                List<JsonNode> matched = new ArrayList<>();
                for (JsonNode a : artifacts) {
                    if (!"Build".equals(a.path("type").asText())) continue;
                    String alias = a.path("alias").asText("").toLowerCase();
                    String defName = a.path("definitionReference").path("definition").path("name").asText("").toLowerCase();
                    if (alias.contains(repoLower) || alias.equals("_" + repoLower) || defName.contains(repoLower)) {
                        matched.add(a);
                    }
                }
                if (matched.isEmpty()) {
                    for (JsonNode a : artifacts) {
                        if ("Build".equals(a.path("type").asText())) matched.add(a);
                    }
                }
                for (JsonNode a : matched) {
                    ObjectNode artOverride = bodyArtifacts.addObject();
                    artOverride.put("alias", a.get("alias").asText());
                    ObjectNode ref = artOverride.putObject("instanceReference");
                    ref.put("id", String.valueOf(buildId));
                    ref.putNull("name");
                }
            }

            // Create release
            String releaseUrl = vsrmBaseUrl(pat) + "/_apis/release/releases?api-version=7.1";
            JsonNode releaseData = postJson(pat, releaseUrl, body);
            int defId = releaseDef.get("id").asInt();

            if (releaseData == null) {
                String errorDetail = lastHttpError.get();
                // Try to extract a readable message from the Azure error JSON
                String readableError = "Failed to create release";
                if (errorDetail != null) {
                    try {
                        JsonNode errJson = mapper.readTree(errorDetail);
                        if (errJson.has("message")) {
                            readableError = "Failed to create release: " + errJson.get("message").asText();
                        } else {
                            readableError = "Failed to create release: " + errorDetail;
                        }
                    } catch (Exception ignored) {
                        readableError = "Failed to create release: " + errorDetail;
                    }
                }

                // Fallback: try to find latest existing release for this definition & deploy to it
                log.info("Attempting to find existing release for definition {} to deploy to {}", defId, environment);
                JsonNode existingRelease = findLatestRelease(pat, defId, buildId);
                if (existingRelease != null) {
                    log.info("Found existing release #{}, will try to deploy to {}", existingRelease.get("id").asInt(), environment);
                    releaseData = existingRelease;
                } else {
                    return new DeployResult(false, readableError, null, null, null);
                }
            }

            int releaseId = releaseData.get("id").asInt();

            // Find target env in created release
            JsonNode targetEnv = findEnvByName(releaseData.get("environments"), environment);
            if (targetEnv == null) {
                return new DeployResult(false, "Target environment not found in created release #" + releaseId,
                        releaseId, null, null);
            }
            int envId = targetEnv.get("id").asInt();

            // Auto-approve any pending pre-deployment approvals before triggering deploy
            approveAllForEnvironment(pat, releaseId, environment, null);

            // Trigger deploy on target env only
            ObjectNode deployBody = mapper.createObjectNode();
            deployBody.put("status", "inProgress");
            deployBody.put("comment", "Triggered by MVA MW Tool for " + environment);

            String deployUrl = vsrmBaseUrl(pat) + "/_apis/release/releases/" + releaseId
                    + "/environments/" + envId + "?api-version=7.2-preview.8";
            JsonNode deployResult = patchJson(pat, deployUrl, deployBody);

            String webUrl = "https://dev.azure.com/" + pat.organization() + "/" + pat.project()
                    + "/_releaseProgress?_a=release-environment-logs&releaseId=" + releaseId + "&definitionId=" + defId;
            String envName = targetEnv.has("name") ? targetEnv.get("name").asText() : environment;

            if (deployResult == null) {
                // The environment PATCH failed — try approving again and retrigger
                log.info("Deploy trigger failed for release #{}, retrying approval + trigger...", releaseId);
                sleep(2000);
                approveAllForEnvironment(pat, releaseId, environment, null);
                sleep(1000);
                deployResult = patchJson(pat, deployUrl, deployBody);
            }

            if (deployResult == null) {
                return new DeployResult(true, "Release #" + releaseId + " created but failed to trigger deploy",
                        releaseId, webUrl, envName);
            }

            return new DeployResult(true, "Release #" + releaseId + " created → deploying to " + envName,
                    releaseId, webUrl, envName);
        } catch (Exception e) {
            return new DeployResult(false, e.getMessage(), null, null, null);
        }
    }

    // ── Check Deployment Status (single poll) ────────────────

    public DeployStatusResult checkDeploymentStatus(PatConfig pat, int releaseId, String environmentName) {
        try {
            // Use the lightweight release overview endpoint (no task logs, smaller payload)
            String url = vsrmBaseUrl(pat) + "/_apis/release/releases/" + releaseId
                    + "?$expand=none&api-version=7.2-preview.8";
            JsonNode data = getJson(pat, url);
            if (data == null) {
                // Fallback: try to get status from approvals API
                int approved = approveAllForEnvironment(pat, releaseId, environmentName, null);
                return new DeployStatusResult(false, false, approved > 0 ? "approving" : "unknown");
            }

            JsonNode env = findEnvByName(data.get("environments"), environmentName);
            if (env == null) return new DeployStatusResult(false, false, "waiting");

            int statusNum;
            JsonNode statusNode = env.get("status");
            if (statusNode.isNumber()) {
                statusNum = statusNode.asInt();
            } else {
                statusNum = RELEASE_STATUS_STRING_MAP.getOrDefault(statusNode.asText(), -1);
            }

            if (statusNum == 4) return new DeployStatusResult(true, true, "succeeded");
            if (!RELEASE_IN_PROGRESS.contains(statusNum)) {
                return new DeployStatusResult(true, false, RELEASE_STATUS_NAMES.getOrDefault(statusNum, "failed(" + statusNum + ")"));
            }
            return new DeployStatusResult(false, false, RELEASE_STATUS_NAMES.getOrDefault(statusNum, "inProgress"));
        } catch (Exception e) {
            return new DeployStatusResult(false, false, "error");
        }
    }

    // ── Wait for Deployment (blocking, with auto-approve) ────

    public ApiResult waitForDeployment(PatConfig pat, int releaseId, String environmentName, Consumer<String> onProgress) {
        return waitForDeployment(pat, releaseId, environmentName, onProgress, () -> false);
    }

    public ApiResult waitForDeployment(PatConfig pat, int releaseId, String environmentName, Consumer<String> onProgress, BooleanSupplier isCancelled) {
        int maxAttempts = 1080; // 90 min at 5s intervals
        int approvalAttempts = 0;
        Integer envId = null; // cache the envId if we got it during deploy()

        for (int i = 0; i < maxAttempts; i++) {
            if (isCancelled.getAsBoolean()) return ApiResult.fail("Release #" + releaseId + " deployment cancelled");
            try {
                // ── Step 1: Always try auto-approve first (lightweight API) ──
                int approved = approveAllForEnvironment(pat, releaseId, environmentName, onProgress);
                if (approved > 0) {
                    approvalAttempts = 0;
                    if (onProgress != null)
                        onProgress.accept("Release #" + releaseId + ": approved — waiting for deployment...");
                    sleep(3000);
                    continue;
                }

                // ── Step 2: Check environment status (using lightweight $expand=none) ──
                String url = vsrmBaseUrl(pat) + "/_apis/release/releases/" + releaseId
                        + "?$expand=none&api-version=7.2-preview.8";
                JsonNode data = getJson(pat, url);

                if (data != null) {
                    JsonNode env = findEnvByName(data.get("environments"), environmentName);
                    if (env != null) {
                        if (envId == null && env.has("id")) envId = env.get("id").asInt();
                        int statusNum;
                        JsonNode statusNode = env.get("status");
                        if (statusNode.isNumber()) {
                            statusNum = statusNode.asInt();
                        } else {
                            statusNum = RELEASE_STATUS_STRING_MAP.getOrDefault(statusNode.asText(), -1);
                        }
                        String statusName = RELEASE_STATUS_NAMES.getOrDefault(statusNum, "unknown(" + statusNum + ")");

                        if (statusNum == 4) {
                            if (onProgress != null)
                                onProgress.accept("Release #" + releaseId + " deployment succeeded");
                            return ApiResult.ok("Release #" + releaseId + " deployment " + statusName);
                        }
                        if (!RELEASE_IN_PROGRESS.contains(statusNum)) {
                            if (onProgress != null)
                                onProgress.accept("Release #" + releaseId + " deployment " + statusName);
                            return ApiResult.fail("Release #" + releaseId + " deployment " + statusName);
                        }

                        // Environment is pending and no approvals found — try environment trigger
                        if ((statusNum == 0 || statusNum == 1 || statusNum == 128)) {
                            approvalAttempts++;
                            if (envId != null && approvalAttempts >= 3 && approvalAttempts % 3 == 0) {
                                log.info("No pending approvals found for release #{}, trying direct environment trigger...", releaseId);
                                ObjectNode deployBody = mapper.createObjectNode();
                                deployBody.put("status", "inProgress");
                                deployBody.put("comment", "Auto-triggered by MVA MW Tool");
                                String deployUrl = vsrmBaseUrl(pat) + "/_apis/release/releases/" + releaseId
                                        + "/environments/" + envId + "?api-version=7.2-preview.8";
                                patchJson(pat, deployUrl, deployBody);
                            }
                        }

                        if (onProgress != null)
                            onProgress.accept("Release #" + releaseId + ": deployment " + statusName + "...");
                    } else {
                        if (onProgress != null)
                            onProgress.accept("Release #" + releaseId + ": waiting for environment...");
                    }
                } else {
                    // Even if release GET fails (too large), approvals may have been handled above
                    log.warn("Release #{} GET returned null (response too large?), relying on approvals API only", releaseId);
                    approvalAttempts++;
                    if (onProgress != null)
                        onProgress.accept("Release #" + releaseId + ": checking approvals (release data unavailable)...");
                }

                sleep(5000);
            } catch (Exception e) {
                return ApiResult.fail(e.getMessage());
            }
        }
        return ApiResult.fail("Release #" + releaseId + " deployment timed out");
    }

    // ── Approvals ────────────────────────────────────────────

    private int approveAllForEnvironment(PatConfig pat, int releaseId, String environmentName, Consumer<String> onProgress) {
        try {
            String url = vsrmBaseUrl(pat) + "/_apis/release/approvals?releaseIdsFilter=" + releaseId
                    + "&statusFilter=pending&api-version=7.1";
            JsonNode data = getJson(pat, url);
            if (data == null || !data.has("value")) return 0;

            List<JsonNode> pending = new ArrayList<>();
            for (JsonNode a : data.get("value")) {
                String envName = a.path("releaseEnvironment").path("name").asText("");
                if (envName.toLowerCase().contains(environmentName.toLowerCase())) {
                    pending.add(a);
                }
            }
            if (pending.isEmpty()) {
                // Fallback: approve all pending
                for (JsonNode a : data.get("value")) pending.add(a);
            }
            if (pending.isEmpty()) return 0;

            int approved = 0;
            for (JsonNode a : pending) {
                int approvalId = a.get("id").asInt();
                ObjectNode approvalBody = mapper.createObjectNode();
                approvalBody.put("status", "approved");
                approvalBody.put("comments", "Auto-approved by MVA MW Tool");

                String approveUrl = vsrmBaseUrl(pat) + "/_apis/release/approvals/" + approvalId + "?api-version=7.1";
                JsonNode result = patchJson(pat, approveUrl, approvalBody);
                if (result != null) {
                    approved++;
                    if (onProgress != null) {
                        String envName = a.path("releaseEnvironment").path("name").asText("unknown");
                        onProgress.accept("✓ Approved deployment to " + envName);
                    }
                }
            }
            return approved;
        } catch (Exception e) {
            log.error("Failed to approve: {}", e.getMessage());
            return 0;
        }
    }

    // ── Find Latest Existing Release ─────────────────────────

    private JsonNode findLatestRelease(PatConfig pat, int definitionId, int buildId) {
        try {
            // Search for releases from this definition, newest first
            String url = vsrmBaseUrl(pat) + "/_apis/release/releases?definitionId=" + definitionId
                    + "&$top=5&$expand=environments&api-version=7.1";
            JsonNode data = getJson(pat, url);
            if (data == null || !data.has("value") || data.get("value").isEmpty()) return null;

            // Prefer a release that uses the same build artifact
            for (JsonNode release : data.get("value")) {
                if (release.has("artifacts")) {
                    for (JsonNode artifact : release.get("artifacts")) {
                        String artBuildId = artifact.path("definitionReference").path("version").path("id").asText("");
                        if (String.valueOf(buildId).equals(artBuildId)) {
                            log.info("Found existing release #{} matching build #{}", release.get("id").asInt(), buildId);
                            return release;
                        }
                    }
                }
            }

            // If none matched the build, return the most recent one
            return data.get("value").get(0);
        } catch (Exception e) {
            log.error("findLatestRelease failed: {}", e.getMessage());
            return null;
        }
    }

    // ── Get Latest Build ─────────────────────────────────────

    public LatestBuildResult getLatestBuild(PatConfig pat, String repo, String branch) {
        try {
            String repoId = getRepoId(pat, repo);
            if (repoId == null) return null;

            String branchRef = branch.startsWith("refs/heads/") ? branch : "refs/heads/" + branch;

            // Try succeeded first
            String url = baseUrl(pat) + "/_apis/build/builds?repositoryId=" + repoId
                    + "&repositoryType=TfsGit&branchName=" + branchRef
                    + "&statusFilter=completed&resultFilter=succeeded&$top=1&api-version=7.1";
            JsonNode data = getJson(pat, url);

            if (data == null || !data.has("value") || data.get("value").isEmpty()) {
                // Try partiallySucceeded
                url = baseUrl(pat) + "/_apis/build/builds?repositoryId=" + repoId
                        + "&repositoryType=TfsGit&branchName=" + branchRef
                        + "&statusFilter=completed&resultFilter=partiallySucceeded&$top=1&api-version=7.1";
                data = getJson(pat, url);
            }

            if (data == null || !data.has("value") || data.get("value").isEmpty()) return null;

            JsonNode build = data.get("value").get(0);
            int buildId = build.get("id").asInt();
            String buildUrl = build.has("_links") && build.get("_links").has("web")
                    ? build.get("_links").get("web").get("href").asText()
                    : baseUrl(pat) + "/_build/results?buildId=" + buildId;
            return new LatestBuildResult(buildId, buildUrl, branch);
        } catch (Exception e) {
            return null;
        }
    }

    // ── Iterations ───────────────────────────────────────────

    public List<IterationResult> getAllIterations(PatConfig pat, String team) {
        try {
            String url = baseUrl(pat) + "/" + team + "/_apis/work/teamsettings/iterations?api-version=7.1";
            JsonNode data = getJson(pat, url);
            if (data == null || !data.has("value")) return List.of();

            List<IterationResult> results = new ArrayList<>();
            for (JsonNode it : data.get("value")) {
                String startDate = it.path("attributes").path("startDate").asText("");
                String finishDate = it.path("attributes").path("finishDate").asText("");
                if (startDate.isEmpty() || finishDate.isEmpty()) continue;
                results.add(new IterationResult(
                        it.get("name").asText(),
                        it.has("path") ? it.get("path").asText() : it.get("name").asText(),
                        startDate.contains("T") ? startDate.split("T")[0] : startDate,
                        finishDate.contains("T") ? finishDate.split("T")[0] : finishDate
                ));
            }
            results.sort(Comparator.comparing(IterationResult::startDate));
            return results;
        } catch (Exception e) {
            return List.of();
        }
    }

    // ── Utility ──────────────────────────────────────────────

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // ── Git Items: Read File Content ─────────────────────────

    /**
     * Read a file from an Azure DevOps Git repository.
     * Uses the Items API: GET _apis/git/repositories/{repo}/items?path={path}&includeContent=true
     */
    public String readGitFile(PatConfig pat, String repo, String branch, String filePath) {
        try {
            String url = baseUrl(pat) + "/_apis/git/repositories/" + repo
                    + "/items?path=" + filePath
                    + "&versionDescriptor.version=" + branch
                    + "&versionDescriptor.versionType=branch"
                    + "&includeContent=true&api-version=7.1";
            String body = webClient.get()
                    .uri(url)
                    .header("Authorization", authHeader(pat))
                    .header("Accept", "application/json")
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();
            if (body == null) return null;
            JsonNode node = mapper.readTree(body);
            if (node.has("content")) {
                return node.get("content").asText();
            }
            return body;
        } catch (Exception e) {
            log.error("readGitFile {} failed: {}", filePath, e.getMessage());
            return null;
        }
    }

    /**
     * Read a file and parse as JSON.
     */
    public JsonNode readGitFileAsJson(PatConfig pat, String repo, String branch, String filePath) {
        try {
            // Use $format=json to get raw content
            String url = baseUrl(pat) + "/_apis/git/repositories/" + repo
                    + "/items?path=" + filePath
                    + "&versionDescriptor.version=" + branch
                    + "&versionDescriptor.versionType=branch"
                    + "&$format=json&includeContent=true&api-version=7.1";
            JsonNode response = getJson(pat, url);
            if (response == null) return null;
            if (response.has("content")) {
                return mapper.readTree(response.get("content").asText());
            }
            return null;
        } catch (Exception e) {
            log.error("readGitFileAsJson {} failed: {}", filePath, e.getMessage());
            return null;
        }
    }

    // ── Git Items: Write File Content (Push) ─────────────────

    /**
     * Write (create or update) a file in an Azure DevOps Git repository.
     * Uses the Pushes API: POST _apis/git/repositories/{repo}/pushes
     */
    public ApiResult writeGitFile(PatConfig pat, String repo, String branch, String filePath, String content, String commitMessage) {
        int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // 1. Get the latest commit objectId for the branch
                String refsUrl = baseUrl(pat) + "/_apis/git/repositories/" + repo
                        + "/refs?filter=heads/" + branch + "&api-version=7.1";
                JsonNode refsData = getJson(pat, refsUrl);
                if (refsData == null || !refsData.has("value") || refsData.get("value").isEmpty()) {
                    return ApiResult.fail("Branch '" + branch + "' not found in repo '" + repo + "'");
                }
                String oldObjectId = refsData.get("value").get(0).get("objectId").asText();

                // 2. Check if file already exists (to decide add vs edit)
                String changeType = "edit";
                String checkUrl = baseUrl(pat) + "/_apis/git/repositories/" + repo
                        + "/items?path=" + filePath
                        + "&versionDescriptor.version=" + branch
                        + "&versionDescriptor.versionType=branch"
                        + "&api-version=7.1";
                try {
                    JsonNode existing = getJson(pat, checkUrl);
                    if (existing == null || existing.has("message")) {
                        changeType = "add";
                    }
                } catch (Exception e) {
                    changeType = "add";
                }

                // 3. Build push payload
                ObjectNode push = mapper.createObjectNode();
                ArrayNode refUpdates = push.putArray("refUpdates");
                ObjectNode refUpdate = refUpdates.addObject();
                refUpdate.put("name", "refs/heads/" + branch);
                refUpdate.put("oldObjectId", oldObjectId);

                ArrayNode commits = push.putArray("commits");
                ObjectNode commit = commits.addObject();
                commit.put("comment", commitMessage != null ? commitMessage : "Update " + filePath);
                ArrayNode changes = commit.putArray("changes");
                ObjectNode change = changes.addObject();
                change.put("changeType", changeType);
                ObjectNode item = change.putObject("item");
                item.put("path", filePath);
                ObjectNode newContent = change.putObject("newContent");
                newContent.put("content", content);
                newContent.put("contentType", "rawtext");

                // 4. Push
                String pushUrl = baseUrl(pat) + "/_apis/git/repositories/" + repo + "/pushes?api-version=7.1";
                JsonNode result = postJson(pat, pushUrl, push);
                if (result == null) {
                    return ApiResult.fail("Failed to push to " + filePath);
                }
                if (result.has("pushId")) {
                    return ApiResult.ok("File saved (push #" + result.get("pushId").asInt() + ")");
                }
                return ApiResult.fail("Unexpected response: " + result);
            } catch (Exception e) {
                if (e.getMessage() != null && e.getMessage().contains("409") && attempt < maxRetries - 1) {
                    log.warn("writeGitFile {} conflict (attempt {}), retrying...", filePath, attempt + 1);
                    sleep(500 * (attempt + 1));
                    continue;
                }
                return ApiResult.fail("writeGitFile failed: " + e.getMessage());
            }
        }
        return ApiResult.fail("writeGitFile failed after " + maxRetries + " retries");
    }

    // ── Git Items: List Files in Directory ───────────────────

    /**
     * List file paths under a directory in an Azure DevOps Git repository.
     * Uses the Items API with recursionLevel=OneLevel.
     * Returns only blob (file) items, not folders.
     */
    public List<String> listGitFiles(PatConfig pat, String repo, String branch, String scopePath) {
        try {
            String url = baseUrl(pat) + "/_apis/git/repositories/" + repo
                    + "/items?scopePath=/" + scopePath
                    + "&recursionLevel=OneLevel"
                    + "&versionDescriptor.version=" + branch
                    + "&versionDescriptor.versionType=branch"
                    + "&api-version=7.1";
            JsonNode response = getJson(pat, url);
            if (response == null || !response.has("value")) return List.of();
            List<String> paths = new ArrayList<>();
            for (JsonNode item : response.get("value")) {
                if (!item.path("isFolder").asBoolean(false)) {
                    paths.add(item.get("path").asText());
                }
            }
            return paths;
        } catch (Exception e) {
            log.error("listGitFiles {} failed: {}", scopePath, e.getMessage());
            return List.of();
        }
    }

    // ── Git Items: Delete File (Push) ────────────────────────

    /**
     * Delete a file from an Azure DevOps Git repository.
     * Uses the Pushes API with changeType "delete".
     */
    public ApiResult deleteGitFile(PatConfig pat, String repo, String branch, String filePath, String commitMessage) {
        int maxRetries = 3;
        for (int attempt = 0; attempt < maxRetries; attempt++) {
            try {
                String refsUrl = baseUrl(pat) + "/_apis/git/repositories/" + repo
                        + "/refs?filter=heads/" + branch + "&api-version=7.1";
                JsonNode refsData = getJson(pat, refsUrl);
                if (refsData == null || !refsData.has("value") || refsData.get("value").isEmpty()) {
                    return ApiResult.fail("Branch '" + branch + "' not found in repo '" + repo + "'");
                }
                String oldObjectId = refsData.get("value").get(0).get("objectId").asText();

                ObjectNode push = mapper.createObjectNode();
                ArrayNode refUpdates = push.putArray("refUpdates");
                ObjectNode refUpdate = refUpdates.addObject();
                refUpdate.put("name", "refs/heads/" + branch);
                refUpdate.put("oldObjectId", oldObjectId);

                ArrayNode commits = push.putArray("commits");
                ObjectNode commit = commits.addObject();
                commit.put("comment", commitMessage != null ? commitMessage : "Delete " + filePath);
                ArrayNode changes = commit.putArray("changes");
                ObjectNode change = changes.addObject();
                change.put("changeType", "delete");
                ObjectNode item = change.putObject("item");
                item.put("path", filePath);

                String pushUrl = baseUrl(pat) + "/_apis/git/repositories/" + repo + "/pushes?api-version=7.1";
                JsonNode result = postJson(pat, pushUrl, push);
                if (result == null) {
                    return ApiResult.fail("Failed to delete " + filePath);
                }
                if (result.has("pushId")) {
                    return ApiResult.ok("File deleted (push #" + result.get("pushId").asInt() + ")");
                }
                return ApiResult.fail("Unexpected response: " + result);
            } catch (Exception e) {
                if (e.getMessage() != null && e.getMessage().contains("409") && attempt < maxRetries - 1) {
                    log.warn("deleteGitFile {} conflict (attempt {}), retrying...", filePath, attempt + 1);
                    sleep(500 * (attempt + 1));
                    continue;
                }
                return ApiResult.fail("deleteGitFile failed: " + e.getMessage());
            }
        }
        return ApiResult.fail("deleteGitFile failed after " + maxRetries + " retries");
    }
}
