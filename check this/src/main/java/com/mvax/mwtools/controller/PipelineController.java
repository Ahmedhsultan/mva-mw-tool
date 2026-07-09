package com.mvax.mwtools.controller;

import com.mvax.mwtools.dto.*;
import com.mvax.mwtools.service.AzureDevOpsService;
import com.mvax.mwtools.service.CutoffService;
import com.mvax.mwtools.service.ReleaseService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * Pipeline controller — SSE orchestration + all Azure DevOps pipeline operations.
 * Clients subscribe via SSE for long-running runs, or call individual endpoints
 * for step-by-step pipeline operations.
 */
@RestController
@RequestMapping("/api/cutoff")
public class PipelineController {

    private final CutoffService cutoffService;
    private final AzureDevOpsService azureService;
    private final ReleaseService releaseService;

    public PipelineController(CutoffService cutoffService,
                              AzureDevOpsService azureService,
                              ReleaseService releaseService) {
        this.cutoffService = cutoffService;
        this.azureService = azureService;
        this.releaseService = releaseService;
    }

    /**
     * Start a release pipeline run. Returns the run ID.
     * Use /api/cutoff/subscribe/{runId} to get SSE events.
     */
    @PostMapping("/start")
    public Map<String, String> startPipeline(@RequestBody PipelineRunRequest request) {
        return cutoffService.start(request);
    }

    /**
     * Subscribe to a pipeline run's progress via SSE.
     * Replays all past events first, then streams live events.
     * Call this after tab refresh to reconnect to an active run.
     */
    @GetMapping(value = "/subscribe/{runId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> subscribe(@PathVariable String runId) {
        SseEmitter emitter = cutoffService.subscribe(runId);
        if (emitter == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(emitter);
    }

    /**
     * Get the current state of a run (polling fallback).
     */
    @GetMapping("/status/{runId}")
    public ResponseEntity<Map<String, Object>> getStatus(@PathVariable String runId) {
        Map<String, Object> status = cutoffService.status(runId);
        if (status == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(status);
    }

    /**
     * List all active (non-complete) run IDs.
     */
    @GetMapping("/active")
    public List<Map<String, Object>> activeRuns() {
        return cutoffService.activeRuns();
    }

    @PostMapping("/cancel/{runId}")
    public ResponseEntity<Map<String, Object>> cancel(@PathVariable String runId) {
        Map<String, Object> response = cutoffService.cancel(runId);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{runId}")
    public ResponseEntity<Map<String, Object>> remove(@PathVariable String runId) {
        Map<String, Object> response = cutoffService.remove(runId);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    @PostMapping("/runs/{runId}/steps/{stepId}/actions/{action}")
    public ResponseEntity<Map<String, Object>> invokeStepAction(
            @PathVariable String runId,
            @PathVariable String stepId,
            @PathVariable String action,
            @RequestBody(required = false) InvokeStepActionRequest request
    ) {
        Map<String, Object> response = cutoffService.invokeStepAction(runId, stepId, action,
                request != null ? request.patConfig() : null);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    // ── Cutoff Pipeline History (local filesystem) ─────────────────────

    @GetMapping("/history")
    public List<PipelineHistoryEntry> history() {
        return cutoffService.history();
    }

    @GetMapping("/history/{id}")
    public ResponseEntity<PipelineHistoryEntry> historyEntry(@PathVariable String id) {
        PipelineHistoryEntry entry = cutoffService.historyEntry(id);
        if (entry == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(entry);
    }

    @DeleteMapping("/history/{id}")
    public ResponseEntity<Map<String, Object>> deleteHistoryEntry(@PathVariable String id) {
        Map<String, Object> response = cutoffService.deleteHistoryEntry(id);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/history")
    public ResponseEntity<Map<String, Object>> clearHistory() {
        return ResponseEntity.ok(cutoffService.clearHistory());
    }

    // ── Azure DevOps pipeline operations ─────────────────────

    @PostMapping("/validate-pat")
    public ApiResult validatePat(@RequestBody PatConfig pat) {
        return azureService.validatePat(pat);
    }

    @PostMapping("/create-branch")
    public ApiResult createBranch(@RequestBody BranchRequest req) {
        return azureService.createBranch(req.patConfig(), req.repo(), req.releaseNumber(), req.branchName());
    }

    @PostMapping("/check-branch")
    public BranchCheckResult checkBranch(@RequestBody BranchRequest req) {
        return azureService.checkBranchExists(req.patConfig(), req.repo(), req.releaseNumber(), req.branchName());
    }

    @PostMapping("/create-pr")
    public PrResult createPr(@RequestBody PrRequest req) {
        return azureService.createPullRequest(req.patConfig(), req.repo(), req.releaseNumber(), req.branchName());
    }

    @PostMapping("/find-pr")
    public BranchCheckResult findPr(@RequestBody PrRequest req) {
        return azureService.findExistingPR(req.patConfig(), req.repo(), req.releaseNumber(), req.branchName());
    }

    @PostMapping("/queue-build")
    public BuildResult queueBuild(@RequestBody BuildRequest req) {
        return azureService.queueBuild(req.patConfig(), req.repo(), req.branch());
    }

    @PostMapping("/check-build")
    public BuildStatusResult checkBuild(@RequestBody PatConfig pat, @RequestParam int buildId) {
        return azureService.checkBuildStatus(pat, buildId);
    }

    @PostMapping("/deploy")
    public DeployResult deploy(@RequestBody DeployRequest req) {
        return azureService.deploy(req.patConfig(), req.buildId(), req.environment(), req.repo());
    }

    @PostMapping("/check-deployment")
    public DeployStatusResult checkDeployment(@RequestBody PatConfig pat,
                                              @RequestParam int releaseId,
                                              @RequestParam String environment) {
        return azureService.checkDeploymentStatus(pat, releaseId, environment);
    }

    @PostMapping("/latest-build")
    public LatestBuildResult latestBuild(@RequestBody PatConfig pat,
                                         @RequestParam String repo,
                                         @RequestParam String branch) {
        return azureService.getLatestBuild(pat, repo, branch);
    }

    @PostMapping("/iterations")
    public List<IterationResult> iterations(@RequestBody PatConfig pat,
                                            @RequestParam(defaultValue = "MVA-Nubia") String team) {
        return azureService.getAllIterations(pat, team);
    }

    /** Cancel a queued or in-progress build */
    @PostMapping("/cancel-build")
    public ApiResult cancelBuild(@RequestBody PatConfig pat, @RequestParam int buildId) {
        return azureService.cancelBuild(pat, buildId);
    }

    // ── Release Records (Git-backed, individual files) ─────

    /** List all release records — reads each file under db/releases/ */
    @PostMapping("/releases/list")
    public List<JsonNode> listReleases(@RequestBody DataRequest req) {
        return releaseService.list(req);
    }

    /** Save a single release record as db/releases/{id}.json */
    @PostMapping("/releases/write")
    public ApiResult writeRelease(@RequestBody DataRequest req) {
        return releaseService.write(req);
    }

    /** Delete a single release record by id */
    @PostMapping("/releases/delete")
    public ApiResult deleteRelease(@RequestBody DataRequest req) {
        return releaseService.delete(req);
    }
}
