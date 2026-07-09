package com.mvax.mwtools.pipeline.steps;

import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.dto.PipelineStepStatus;
import com.mvax.mwtools.pipeline.RunningPipeline;

import java.util.Collections;
import java.util.List;

/**
 * Abstract base class for all pipeline steps.
 *
 * Steps are responsible for:
 * - executing their logic ({@link #execute(RunningPipeline)})
 * - extracting their history snapshot ({@link #toHistory(RunningPipeline)})
 */
public abstract class PipelineStep {

    private final String id;
    private final String label;
    private final String description;

    private volatile PipelineStepStatus status = PipelineStepStatus.PENDING;
    private final List<String> logs = Collections.synchronizedList(new java.util.ArrayList<>());

    protected PipelineStep(String id, String label, String description) {
        this.id = id;
        this.label = label;
        this.description = description;
    }

    public final String getId() {
        return id;
    }

    public final String getLabel() {
        return label;
    }

    public final String getDescription() {
        return description;
    }

    public final PipelineStepStatus getStatus() {
        return status;
    }

    public final void setStatus(PipelineStepStatus status) {
        this.status = status;
    }

    public final List<String> getLogs() {
        return List.copyOf(logs);
    }

    // ── Abstract contract ────────────────────────────────────

    public abstract void execute(RunningPipeline pipeline);

    public abstract PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline);

    // ── Step actions (called by frontend buttons) ───────────

    /** Best-effort status refresh for the step. Default: not supported. */
    public boolean refresh(RunningPipeline pipeline) {
        return false;
    }

    /** Retry/rerun request. Default: emit an informational event. */
    public boolean retry(RunningPipeline pipeline) {
        pipeline.emit("action", id, null, "Retry requested", java.util.Map.of("action", "retry"));
        return true;
    }

    /** Cancel the whole pipeline. */
    public boolean cancel(RunningPipeline pipeline) {
        pipeline.cancel();
        return true;
    }

    /** Dispatch a named action to this step. */
    public boolean invokeAction(RunningPipeline pipeline, String action) {
        if (action == null || action.isBlank()) return false;
        return switch (action.toLowerCase()) {
            case "refresh" -> refresh(pipeline);
            case "retry", "rerun" -> retry(pipeline);
            case "cancel" -> cancel(pipeline);
            default -> false;
        };
    }

    protected final PipelineHistoryEntry.StepHistory history(
            PipelineHistoryEntry.TaskEntry result,
            List<PipelineHistoryEntry.TaskEntry> tasks,
            List<PipelineHistoryEntry.EnvTaskEntry> envTasks,
            List<PipelineHistoryEntry.DeployTaskEntry> deployTasks
    ) {
        return new PipelineHistoryEntry.StepHistory(
                id,
                label,
                description,
                status.name().toLowerCase(),
                List.copyOf(logs),
                result,
                tasks != null ? List.copyOf(tasks) : List.of(),
                envTasks != null ? List.copyOf(envTasks) : List.of(),
                deployTasks != null ? List.copyOf(deployTasks) : List.of()
        );
    }

    // ── Lifecycle helpers ───────────────────────────────────

    public final void markRunning(RunningPipeline pipeline) {
        this.status = PipelineStepStatus.RUNNING;
        pipeline.emit("step-start", id, null, "Starting: " + label, null);
    }

    protected final void succeed(RunningPipeline pipeline, String message) {
        this.status = PipelineStepStatus.SUCCESS;
        log(message);
        pipeline.emit("step-success", id, null, message, null);
    }

    protected final void fail(RunningPipeline pipeline, String message) {
        this.status = PipelineStepStatus.FAILED;
        log("FAILED: " + message);
        pipeline.emit("step-failed", id, null, message, null);
    }

    protected final void skip(RunningPipeline pipeline, String reason) {
        this.status = PipelineStepStatus.SKIPPED;
        log("SKIPPED: " + reason);
        pipeline.emit("step-skipped", id, null, reason, null);
    }

    protected final void waitForApproval(RunningPipeline pipeline, String message) {
        this.status = PipelineStepStatus.WAITING_APPROVAL;
        log("Waiting for approval: " + message);
        pipeline.emit("step-waiting", id, null, message, null);
    }

    protected final void log(String message) {
        logs.add(java.time.Instant.now() + " " + message);
    }
}
