package com.mvax.mwtools.service;

import com.mvax.mwtools.dto.DeployBranchRunRequest;
import com.mvax.mwtools.dto.PatConfig;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.dto.ResumeDeployBranchHistoryRequest;
import com.mvax.mwtools.pipeline.RunningPipelineList;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@Service
public class DeployBranchService {

    private final RunningPipelineList pipelineList;
    private final PipelineHistoryService historyService;

    public DeployBranchService(RunningPipelineList pipelineList, PipelineHistoryService historyService) {
        this.pipelineList = pipelineList;
        this.historyService = historyService;
    }

    public Map<String, String> start(DeployBranchRunRequest request) {
        String runId = pipelineList.startDeployBranchRun(request);
        return Map.of("runId", runId);
    }

    public SseEmitter subscribe(String runId) {
        return pipelineList.subscribe(runId);
    }

    public Map<String, Object> cancel(String runId) {
        boolean cancelled = pipelineList.cancelPipeline(runId);
        if (!cancelled) return null;
        return Map.of("cancelled", true, "runId", runId);
    }

    public Map<String, Object> remove(String runId) {
        boolean removed = pipelineList.removePipeline(runId);
        if (!removed) return null;
        return Map.of("removed", true, "runId", runId);
    }

    public Map<String, Object> status(String runId) {
        return pipelineList.getPipelineStatus(runId);
    }

    public List<Map<String, Object>> activeRuns() {
        return pipelineList.getActiveDeployBranchRuns();
    }

    public Map<String, Object> approve(String runId) {
        boolean ok = pipelineList.respondToApproval(runId, true);
        if (!ok) return null;
        return Map.of("approved", true, "runId", runId);
    }

    public Map<String, Object> reject(String runId) {
        boolean ok = pipelineList.respondToApproval(runId, false);
        if (!ok) return null;
        return Map.of("rejected", true, "runId", runId);
    }

    public Map<String, Object> invokeStepAction(String runId, String stepId, String action, PatConfig patConfig) {
        boolean ok = pipelineList.invokeStepAction(runId, stepId, action, patConfig);
        if (!ok) return null;
        return Map.of("ok", true, "runId", runId, "stepId", stepId, "action", action);
    }

    public Map<String, String> resumeHistory(String id, ResumeDeployBranchHistoryRequest request) {
        if (request == null || request.patConfig() == null) return null;
        String runId = pipelineList.resumeDeployBranchRunFromHistory(id, request.patConfig(), request.fromStepId());
        if (runId == null) return null;
        return Map.of("runId", runId);
    }

    public List<PipelineHistoryEntry> history() {
        return historyService.loadAll().stream()
                .filter(e -> e != null && "deploy-branch".equals(e.type()))
                .toList();
    }

    public PipelineHistoryEntry historyEntry(String id) {
        PipelineHistoryEntry e = historyService.load(id);
        return e != null && "deploy-branch".equals(e.type()) ? e : null;
    }

    public Map<String, Object> deleteHistoryEntry(String id) {
        boolean deleted = historyService.delete(id);
        if (!deleted) return null;
        return Map.of("deleted", true, "id", id);
    }

    public Map<String, Object> clearHistory() {
        historyService.deleteAll();
        return Map.of("cleared", true);
    }
}
