package com.mvax.mwtools.pipeline;

import com.mvax.mwtools.dto.PatConfig;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.dto.PipelineStepStatus;
import com.mvax.mwtools.pipeline.steps.PipelineStep;
import com.mvax.mwtools.service.AzureDevOpsService;
import lombok.Getter;
import lombok.Setter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;

/**
 * Represents one active pipeline execution (e.g. a deploy-branch run).
 * Holds the ordered list of steps, shared context, and SSE broadcasting.
 */
@Getter
public class RunningPipeline {

    private static final Logger log = LoggerFactory.getLogger(RunningPipeline.class);

    public record RunEvent(String type, String step, String service, String message, Object data) {}

    private final String id;
    private final String type;
    private final String branch;
    private final List<String> services;
    private final List<String> environments;
    private volatile String status = "running"; // running | success | failed | cancelled
    private final Instant startedAt;
    private volatile Instant finishedAt;
    private volatile boolean cancelled = false;

    private final List<PipelineStep> steps;
    private volatile Map<String, Integer> buildIds = Map.of();
    private final List<RunEvent> eventLog = Collections.synchronizedList(new ArrayList<>());
    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();

    /** Optional: previous history entry when resuming a run. Used to preserve step histories for skipped steps. */
    @Setter
    private PipelineHistoryEntry baseHistory;

    private final Set<String> executedStepIds = ConcurrentHashMap.newKeySet();

    // ── Services available to steps ──────────────────────────
    private final AzureDevOpsService azureService;
    private final PatConfig patConfig;

    /** Used by steps that need user approval before proceeding. */
    private volatile CompletableFuture<Boolean> approvalFuture;

    /** Called when the pipeline finishes (success, failed, or cancelled). */
    @Setter
    private Consumer<RunningPipeline> onComplete;

    public RunningPipeline(
            String id,
            String type,
            String branch,
            List<String> services,
            List<String> environments,
            List<PipelineStep> steps,
            AzureDevOpsService azureService,
            PatConfig patConfig
    ) {
        this(id, type, branch, services, environments, steps, azureService, patConfig, Instant.now());
    }

    public RunningPipeline(
            String id,
            String type,
            String branch,
            List<String> services,
            List<String> environments,
            List<PipelineStep> steps,
            AzureDevOpsService azureService,
            PatConfig patConfig,
            Instant startedAt
    ) {
        this.id = id;
        this.type = type;
        this.branch = branch;
        this.services = services != null ? List.copyOf(services) : List.of();
        this.environments = environments != null ? List.copyOf(environments) : List.of();
        this.steps = steps;
        this.azureService = azureService;
        this.patConfig = patConfig;
        this.startedAt = startedAt != null ? startedAt : Instant.now();
    }

    // ── Execution ────────────────────────────────────────────

    /**
     * Run all steps sequentially. Stops on failure or cancellation.
     */
    public void run() {
        try {
            boolean pipelineSucceeded = true;
            for (PipelineStep step : steps) {
                // Allow resuming: skip steps already marked as success/skipped.
                if (step.getStatus() == PipelineStepStatus.SUCCESS || step.getStatus() == PipelineStepStatus.SKIPPED) {
                    continue;
                }
                if (cancelled) {
                    step.setStatus(PipelineStepStatus.CANCELLED);
                    pipelineSucceeded = false;
                    continue;
                }
                step.markRunning(this);
                step.execute(this);
                executedStepIds.add(step.getId());

                if (step.getStatus() == PipelineStepStatus.FAILED) {
                    complete(false);
                    return;
                }
            }
            complete(pipelineSucceeded);
        } catch (Exception e) {
            log.error("Pipeline {} failed unexpectedly: {}", id, e.getMessage(), e);
            emit("error", null, null, "Pipeline failed: " + e.getMessage(), null);
            complete(false);
        }
    }

    // ── SSE Broadcasting ─────────────────────────────────────

    public void emit(String type, String step, String service, String message, Object data) {
        RunEvent event = new RunEvent(type, step, service, message, data);
        eventLog.add(event);

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().data(event));
            } catch (IOException e) {
                emitters.remove(emitter);
            }
        }
    }

    public SseEmitter subscribe(long timeout) {
        SseEmitter emitter = new SseEmitter(timeout);
        emitters.add(emitter);

        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(e -> emitters.remove(emitter));

        // Replay past events
        try {
            synchronized (eventLog) {
                for (RunEvent event : eventLog) {
                    emitter.send(SseEmitter.event().data(event));
                }
            }
            if (isComplete()) {
                emitter.send(SseEmitter.event().data(
                        new RunEvent("complete", null, null, "Run " + status, Map.of("status", status))));
                emitter.complete();
            }
        } catch (IOException e) {
            emitters.remove(emitter);
        }

        return emitter;
    }

    // ── Lifecycle ────────────────────────────────────────────

    public void cancel() {
        this.cancelled = true;
        // Unblock any step waiting for approval
        CompletableFuture<Boolean> f = approvalFuture;
        if (f != null && !f.isDone()) f.complete(false);
        emit("cancelled", null, null, "Run cancelled by user", null);
        complete(false, "cancelled");
    }

    private void complete(boolean success) {
        complete(success, success ? "success" : "failed");
    }

    private void complete(boolean success, String status) {
        this.status = status;
        this.finishedAt = Instant.now();

        RunEvent completeEvent = new RunEvent("complete", null, null,
                "Run " + this.status, Map.of("status", this.status));

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().data(completeEvent));
                emitter.complete();
            } catch (IOException e) {
                // ignore
            }
        }
        emitters.clear();

        // Notify listener (e.g. to save history)
        Consumer<RunningPipeline> cb = onComplete;
        if (cb != null) {
            try { cb.accept(this); } catch (Exception e) {
                log.error("onComplete callback failed: {}", e.getMessage());
            }
        }
    }

    // ── Data shared between steps ───────────────────────────

    public void setBuildIds(Map<String, Integer> buildIds) {
        this.buildIds = buildIds != null ? Map.copyOf(buildIds) : Map.of();
    }

    // ── Approval gate ────────────────────────────────────────

    /**
     * Called by a step that needs user approval. Blocks the calling thread
     * until {@link #respondToApproval(boolean)} is called or the pipeline is cancelled.
     * @return true if approved, false if rejected or cancelled
     */
    public boolean requestApproval() {
        approvalFuture = new CompletableFuture<>();
        try {
            return approvalFuture.get();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Called from the controller when the user approves or rejects.
     */
    public void respondToApproval(boolean approved) {
        CompletableFuture<Boolean> f = approvalFuture;
        if (f != null && !f.isDone()) {
            f.complete(approved);
        }
    }

    public boolean isWaitingForApproval() {
        CompletableFuture<Boolean> f = approvalFuture;
        return f != null && !f.isDone();
    }

    // ── History snapshot ─────────────────────────────────────

    /**
     * Walk the event log and reconstruct a {@link PipelineHistoryEntry}
     * that can be persisted to disk.
     */
    public PipelineHistoryEntry buildHistoryEntry() {
        Map<String, PipelineHistoryEntry.StepHistory> baseSteps = new HashMap<>();
        PipelineHistoryEntry base = baseHistory;
        if (base != null && base.steps() != null) {
            for (PipelineHistoryEntry.StepHistory s : base.steps()) {
                if (s != null && s.id() != null) baseSteps.put(s.id(), s);
            }
        }

        List<PipelineHistoryEntry.StepHistory> stepHistories = steps.stream()
                .map(s -> {
                    if (base != null && !executedStepIds.contains(s.getId())) {
                        PipelineHistoryEntry.StepHistory prior = baseSteps.get(s.getId());
                        if (prior != null) return prior;
                    }
                    return s.toHistory(this);
                })
                .toList();

        return new PipelineHistoryEntry(
                id,
                type,
                branch,
                services,
                environments,
                startedAt.toString(),
                finishedAt != null ? finishedAt.toString() : Instant.now().toString(),
                status,
                stepHistories
        );
    }

    // ── Helpers ──────────────────────────────────────────────

    public boolean isComplete() {
        return "success".equals(status) || "failed".equals(status) || "cancelled".equals(status);
    }
}
