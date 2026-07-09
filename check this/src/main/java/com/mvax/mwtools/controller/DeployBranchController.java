package com.mvax.mwtools.controller;

import com.mvax.mwtools.dto.DeployBranchRunRequest;
import com.mvax.mwtools.dto.InvokeStepActionRequest;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.dto.ResumeDeployBranchHistoryRequest;
import com.mvax.mwtools.service.DeployBranchService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

/**
 * Controller for the Deploy Branch feature.
 * Delegates to {@link RunningPipelineList} which manages pipelines
 * with structured steps and 1SSE streaming.
 */
@RestController
@RequestMapping("/api/deploy-branch")
public class DeployBranchController {

    private final DeployBranchService deployBranchService;

    public DeployBranchController(DeployBranchService deployBranchService) {
        this.deployBranchService = deployBranchService;
    }

    @PostMapping("/start")
    public Map<String, String> start(@RequestBody DeployBranchRunRequest request) {
        return deployBranchService.start(request);
    }

    @GetMapping(value = "/subscribe/{runId}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> subscribe(@PathVariable String runId) {
        SseEmitter emitter = deployBranchService.subscribe(runId);
        if (emitter == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(emitter);
    }

    @PostMapping("/cancel/{runId}")
    public ResponseEntity<Map<String, Object>> cancel(@PathVariable String runId) {
        Map<String, Object> response = deployBranchService.cancel(runId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{runId}")
    public ResponseEntity<Map<String, Object>> remove(@PathVariable String runId) {
        Map<String, Object> response = deployBranchService.remove(runId);
        if (response == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/status/{runId}")
    public ResponseEntity<Map<String, Object>> getStatus(@PathVariable String runId) {
        Map<String, Object> status = deployBranchService.status(runId);
        if (status == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(status);
    }

    @GetMapping("/active")
    public List<Map<String, Object>> activeRuns() {
        return deployBranchService.activeRuns();
    }

    @PostMapping("/approve/{runId}")
    public ResponseEntity<Map<String, Object>> approve(@PathVariable String runId) {
        Map<String, Object> response = deployBranchService.approve(runId);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    @PostMapping("/reject/{runId}")
    public ResponseEntity<Map<String, Object>> reject(@PathVariable String runId) {
        Map<String, Object> response = deployBranchService.reject(runId);
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
        Map<String, Object> response = deployBranchService.invokeStepAction(runId, stepId, action,
                request != null ? request.patConfig() : null);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    @PostMapping("/history/{id}/resume")
    public ResponseEntity<Map<String, String>> resumeHistory(
            @PathVariable String id,
            @RequestBody ResumeDeployBranchHistoryRequest request
    ) {
        Map<String, String> response = deployBranchService.resumeHistory(id, request);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    // ── Pipeline History ─────────────────────────────────────

    @GetMapping("/history")
    public List<PipelineHistoryEntry> getHistory() {
        return deployBranchService.history();
    }

    @GetMapping("/history/{id}")
    public ResponseEntity<PipelineHistoryEntry> getHistoryEntry(@PathVariable String id) {
        PipelineHistoryEntry entry = deployBranchService.historyEntry(id);
        if (entry == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(entry);
    }

    @DeleteMapping("/history/{id}")
    public ResponseEntity<Map<String, Object>> deleteHistoryEntry(@PathVariable String id) {
        Map<String, Object> response = deployBranchService.deleteHistoryEntry(id);
        if (response == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/history")
    public ResponseEntity<Map<String, Object>> clearHistory() {
        return ResponseEntity.ok(deployBranchService.clearHistory());
    }
}
