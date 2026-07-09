package com.mvax.mwtools.service;

import com.mvax.mwtools.dto.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Orchestrates long-running pipeline runs server-side.
 * Each run executes in a background thread and streams progress to the client via SSE.
 * Survives browser tab refresh — the client can reconnect to an active run by ID.
 */
@Service
public class PipelineOrchestrationService {

    private static final Logger log = LoggerFactory.getLogger(PipelineOrchestrationService.class);
    private static final long SSE_TIMEOUT = 120 * 60 * 1000L; // 2 hours

    private final AzureDevOpsService azureService;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    /** Active runs keyed by runId */
    private final ConcurrentHashMap<String, RunState> activeRuns = new ConcurrentHashMap<>();

    public PipelineOrchestrationService(AzureDevOpsService azureService) {
        this.azureService = azureService;
    }

    // ── Data classes ─────────────────────────────────────────

    public record RunEvent(String type, String step, String service, String message, Object data) {
    }

    public static class RunState {
        public final String runId;
        public final String type; // "cutoff" | "deploy-branch"
        public final String startedAt;
        public final List<RunEvent> eventLog = Collections.synchronizedList(new ArrayList<>());
        public final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
        public volatile boolean complete = false;
        public volatile boolean cancelled = false;
        public volatile String status = "running"; // running | success | failed | cancelled

        public RunState(String runId, String type) {
            this.runId = runId;
            this.type = type;
            this.startedAt = Instant.now().toString();
        }
    }

    // ── Public API ───────────────────────────────────────────

    /**
     * Convenience wrapper for controllers: starts a run and returns the standard response payload.
     */
    public Map<String, String> startPipeline(PipelineRunRequest request) {
        String runId = startPipelineRun(request);
        return Map.of("runId", runId);
    }

    /**
     * Start a release pipeline run. Returns the run ID immediately.
     * Progress is streamed via SSE.
     */
    public String startPipelineRun(PipelineRunRequest request) {
        String runId = UUID.randomUUID().toString();
        RunState state = new RunState(runId, "cutoff");
        activeRuns.put(runId, state);

        executor.submit(() -> executePipelineRun(runId, request, state));
        return runId;
    }

    /**
     * Cancel a running pipeline. Sets the cancelled flag so the execution loop stops.
     */
    public boolean cancelRun(String runId) {
        RunState state = activeRuns.get(runId);
        if (state == null || state.complete) return false;
        state.cancelled = true;
        emit(state, "cancelled", null, null, "Run cancelled by user", null);
        completeRun(state, false, "cancelled");
        return true;
    }

    /**
     * Remove a completed or cancelled run from tracking.
     */
    public boolean removeRun(String runId) {
        RunState state = activeRuns.get(runId);
        if (state == null) return false;
        if (!state.complete) cancelRun(runId);
        activeRuns.remove(runId);
        return true;
    }

    /**
     * Subscribe to a run's progress via SSE.
     * First replays all past events, then streams live events.
     */
    public SseEmitter subscribe(String runId) {
        RunState state = activeRuns.get(runId);
        if (state == null) return null;

        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT);
        state.emitters.add(emitter);

        emitter.onCompletion(() -> state.emitters.remove(emitter));
        emitter.onTimeout(() -> state.emitters.remove(emitter));
        emitter.onError(e -> state.emitters.remove(emitter));

        // Replay past events
        try {
            synchronized (state.eventLog) {
                for (RunEvent event : state.eventLog) {
                    emitter.send(SseEmitter.event().data(event));
                }
            }
            if (state.complete) {
                emitter.send(SseEmitter.event().data(
                        new RunEvent("complete", null, null, "Run " + state.status, null)));
                emitter.complete();
            }
        } catch (IOException e) {
            state.emitters.remove(emitter);
        }

        return emitter;
    }

    /**
     * Get the current state of a run (for polling fallback).
     */
    public RunState getRunState(String runId) {
        return activeRuns.get(runId);
    }

    /**
     * Convenience wrapper for controllers: returns a small polling status payload, or null if runId is unknown.
     */
    public Map<String, Object> getStatusSummary(String runId) {
        RunState state = getRunState(runId);
        if (state == null) return null;
        return buildStatusSummary(state);
    }

    public Map<String, Object> buildStatusSummary(RunState state) {
        return Map.of(
                "runId", state.runId,
                "status", state.status,
                "complete", state.complete,
                "startedAt", state.startedAt,
                "eventCount", state.eventLog.size()
        );
    }

    /**
     * List all active (non-complete) run IDs.
     */
    public List<String> getActiveRunIds() {
        List<String> ids = new ArrayList<>();
        activeRuns.forEach((id, state) -> {
            if (!state.complete) ids.add(id);
        });
        return ids;
    }

    // ── Pipeline Execution ───────────────────────────────────

    private void executePipelineRun(String runId, PipelineRunRequest req, RunState state) {
        PatConfig pat = req.patConfig();
        List<String> steps = req.enabledSteps() != null ? req.enabledSteps() : List.of();
        List<String> buildCats = req.enabledBuildCategories() != null ? req.enabledBuildCategories() : List.of();
        boolean allSuccess = true;

        try {
            // Step 1: Validate PAT
            if (steps.contains("validate-pat")) {
                emit(state, "step-start", "validate-pat", null, "Validating PAT...", null);
                ApiResult result = azureService.validatePat(pat);
                emit(state, result.success() ? "step-success" : "step-failed", "validate-pat", null, result.message(), null);
                if (!result.success()) {
                    completeRun(state, false);
                    return;
                }
            }

            // Step 2: Create branches
            if (steps.contains("create-branch")) {
                emit(state, "step-start", "create-branch", null, "Creating release branches...", null);
                for (String svc : req.services()) {
                    emit(state, "service-start", "create-branch", svc, "Creating branch for " + svc, null);
                    ApiResult result = azureService.createBranch(pat, svc, req.releaseNumber(), null);
                    emit(state, result.success() ? "service-success" : "service-failed",
                            "create-branch", svc, result.message(), null);
                    if (!result.success()) allSuccess = false;
                }
                emit(state, allSuccess ? "step-success" : "step-failed", "create-branch", null, "Branch creation done", null);
            }

            // Step 3: Create PRs
            if (steps.contains("create-pr")) {
                emit(state, "step-start", "create-pr", null, "Creating pull requests...", null);
                boolean prSuccess = true;
                for (String svc : req.services()) {
                    emit(state, "service-start", "create-pr", svc, "Creating PR for " + svc, null);
                    PrResult result = azureService.createPullRequest(pat, svc, req.releaseNumber(), null);
                    Map<String, Object> data = new HashMap<>();
                    data.put("prUrl", result.prUrl());
                    data.put("prId", result.prId());
                    emit(state, result.success() ? "service-success" : "service-failed",
                            "create-pr", svc, result.message(), data);
                    if (!result.success()) prSuccess = false;
                }
                if (!prSuccess) allSuccess = false;
                emit(state, prSuccess ? "step-success" : "step-failed", "create-pr", null, "PR creation done", null);
            }

            // Step 4: Build
            if (steps.contains("build-both")) {
                emit(state, "step-start", "build-both", null, "Queuing builds...", null);
                Map<String, Integer> buildIds = new HashMap<>();
                boolean buildSuccess = true;

                // Queue release builds
                if (buildCats.contains("release")) {
                    for (String svc : req.services()) {
                        String branch = "release/primary/" + req.releaseNumber();
                        emit(state, "service-start", "build-both", svc, "Queuing release build for " + svc, null);
                        BuildResult result = azureService.queueBuild(pat, svc, branch);
                        Map<String, Object> data = new HashMap<>();
                        data.put("buildId", result.buildId());
                        data.put("buildUrl", result.buildUrl());
                        data.put("buildType", "release");
                        emit(state, result.success() ? "service-success" : "service-failed",
                                "build-both", svc, result.message(), data);
                        if (result.success() && result.buildId() != null) {
                            buildIds.put(svc + ":release", result.buildId());
                        } else {
                            buildSuccess = false;
                        }
                    }
                }

                // Queue master builds
                if (buildCats.contains("master")) {
                    for (String svc : req.services()) {
                        emit(state, "service-start", "build-both", svc + ":master", "Queuing master build for " + svc, null);
                        BuildResult result = azureService.queueBuild(pat, svc, "master");
                        Map<String, Object> data = new HashMap<>();
                        data.put("buildId", result.buildId());
                        data.put("buildUrl", result.buildUrl());
                        data.put("buildType", "master");
                        emit(state, result.success() ? "service-success" : "service-failed",
                                "build-both", svc + ":master", result.message(), data);
                        if (result.success() && result.buildId() != null) {
                            buildIds.put(svc + ":master", result.buildId());
                        }
                    }
                }

                // Wait for all builds to complete
                for (Map.Entry<String, Integer> entry : buildIds.entrySet()) {
                    String key = entry.getKey();
                    int buildId = entry.getValue();
                    emit(state, "service-start", "build-both", key, "Waiting for build #" + buildId, null);
                    ApiResult waitResult = azureService.waitForBuild(pat, buildId,
                            progress -> emit(state, "progress", "build-both", key, progress, null));
                    emit(state, waitResult.success() ? "service-success" : "service-failed",
                            "build-both", key, waitResult.message(), null);
                    if (!waitResult.success()) buildSuccess = false;
                }

                if (!buildSuccess) allSuccess = false;
                emit(state, buildSuccess ? "step-success" : "step-failed", "build-both", null, "Builds done", null);
            }

            // Step 5-7: Deploy steps
            List<String> deploySteps = List.of("deploy-drop-db", "deploy-master", "deploy-release");
            for (String deployStep : deploySteps) {
                if (!steps.contains(deployStep)) continue;

                emit(state, "step-start", deployStep, null, "Starting " + deployStep + "...", null);
                boolean deploySuccess = true;

                for (String svc : req.services()) {
                    // Determine which branch/build to use for this deploy step
                    String buildBranch;
                    if ("deploy-drop-db".equals(deployStep)) {
                        buildBranch = null; // needs special handling per service config
                        continue; // Skip for now — handled by frontend settings
                    } else if ("deploy-master".equals(deployStep)) {
                        buildBranch = "master";
                    } else {
                        buildBranch = "release/primary/" + req.releaseNumber();
                    }

                    // Find latest build for this branch
                    emit(state, "service-start", deployStep, svc, "Finding latest build for " + svc, null);
                    LatestBuildResult latest = azureService.getLatestBuild(pat, svc, buildBranch);
                    if (latest == null) {
                        emit(state, "service-failed", deployStep, svc, "No build found for " + svc + " on " + buildBranch, null);
                        deploySuccess = false;
                        continue;
                    }

                    // Deploy
                    emit(state, "service-start", deployStep, svc, "Deploying " + svc + " to " + req.environment(), null);
                    DeployResult deployResult = azureService.deploy(pat, latest.buildId(), req.environment(), svc);
                    Map<String, Object> data = new HashMap<>();
                    data.put("releaseId", deployResult.releaseId());
                    data.put("releaseUrl", deployResult.releaseUrl());
                    emit(state, deployResult.success() ? "service-success" : "service-failed",
                            deployStep, svc, deployResult.message(), data);

                    if (!deployResult.success()) {
                        deploySuccess = false;
                        continue;
                    }

                    // Wait for deployment
                    if (deployResult.releaseId() != null) {
                        ApiResult waitResult = azureService.waitForDeployment(pat, deployResult.releaseId(), req.environment(),
                                progress -> emit(state, "progress", deployStep, svc, progress, null));
                        emit(state, waitResult.success() ? "service-success" : "service-failed",
                                deployStep, svc, waitResult.message(), null);
                        if (!waitResult.success()) deploySuccess = false;
                    }
                }

                if (!deploySuccess) allSuccess = false;
                emit(state, deploySuccess ? "step-success" : "step-failed", deployStep, null, deployStep + " done", null);
            }

            completeRun(state, allSuccess);
        } catch (Exception e) {
            log.error("Pipeline run {} failed: {}", runId, e.getMessage(), e);
            emit(state, "error", null, null, "Pipeline run failed: " + e.getMessage(), null);
            completeRun(state, false);
        }
    }

    // ── SSE Helpers ──────────────────────────────────────────

    private void emit(RunState state, String type, String step, String service, String message, Object data) {
        RunEvent event = new RunEvent(type, step, service, message, data);
        state.eventLog.add(event);

        for (SseEmitter emitter : state.emitters) {
            try {
                emitter.send(SseEmitter.event().data(event));
            } catch (IOException e) {
                state.emitters.remove(emitter);
            }
        }
    }

    private void completeRun(RunState state, boolean success) {
        completeRun(state, success, success ? "success" : "failed");
    }

    private void completeRun(RunState state, boolean success, String status) {
        state.status = status;
        state.complete = true;

        RunEvent completeEvent = new RunEvent("complete", null, null,
                "Run " + state.status, Map.of("status", state.status));

        for (SseEmitter emitter : state.emitters) {
            try {
                emitter.send(SseEmitter.event().data(completeEvent));
                emitter.complete();
            } catch (IOException e) {
                // ignore
            }
        }
        state.emitters.clear();

        // Clean up old runs after 2 hours
        executor.submit(() -> {
            try {
                Thread.sleep(2 * 60 * 60 * 1000L);
                activeRuns.remove(state.runId);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }
}
