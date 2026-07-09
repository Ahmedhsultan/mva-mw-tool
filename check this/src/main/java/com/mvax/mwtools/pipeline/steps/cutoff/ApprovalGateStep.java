package com.mvax.mwtools.pipeline.steps.cutoff;

import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;

/**
 * Manual approval gate used before Deploy Release in the cutoff pipeline.
 */
public class ApprovalGateStep extends PipelineStep {

    private final boolean enabled;
    private PipelineHistoryEntry.TaskEntry result;

    public ApprovalGateStep(boolean enabled) {
        super("approve-release", "Approve Release Deploy", "Manual approval before deploying the release build");
        this.enabled = enabled;
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        if (!enabled) {
            skip(pipeline, "Disabled");
            return;
        }

        waitForApproval(pipeline, "Waiting for user approval to deploy release build");
        pipeline.emit("approval-required", getId(), null, "Waiting for approval to deploy release build", null);

        boolean approved = pipeline.requestApproval();
        if (pipeline.isCancelled()) return;

        if (approved) {
            pipeline.emit("approval-granted", getId(), null, "User approved — continuing", null);
            result = new PipelineHistoryEntry.TaskEntry("approval", "success", "Approved", null, null);
            succeed(pipeline, "Approved");
        } else {
            pipeline.emit("approval-rejected", getId(), null, "User rejected — stopping", null);
            result = new PipelineHistoryEntry.TaskEntry("approval", "failed", "Rejected", null, null);
            fail(pipeline, "Rejected");
        }
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        return history(result, null, null, null);
    }

    @Override
    public boolean invokeAction(RunningPipeline pipeline, String action) {
        if (action == null || action.isBlank()) return false;
        return switch (action.toLowerCase()) {
            case "approve" -> {
                pipeline.respondToApproval(true);
                yield true;
            }
            case "reject" -> {
                pipeline.respondToApproval(false);
                yield true;
            }
            default -> super.invokeAction(pipeline, action);
        };
    }
}
