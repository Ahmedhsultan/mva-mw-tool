package com.mvax.mwtools.pipeline.steps.cutoff;

import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;

/** Validate the PAT if enabled, otherwise skip. */
public class ValidatePatIfEnabledStep extends PipelineStep {

    private final boolean enabled;
    private PipelineHistoryEntry.TaskEntry result;

    public ValidatePatIfEnabledStep(boolean enabled) {
        super("validate-pat", "Validate PAT", "Verify Azure DevOps Personal Access Token has access");
        this.enabled = enabled;
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        if (!enabled) {
            skip(pipeline, "Disabled");
            return;
        }

        pipeline.emit("service-start", getId(), null, "Validating PAT...", null);
        ApiResult apiResult = pipeline.getAzureService().validatePat(pipeline.getPatConfig());

        this.result = new PipelineHistoryEntry.TaskEntry(
                "PAT",
                apiResult.success() ? "success" : "failed",
                apiResult.message(),
                null,
                null
        );

        if (apiResult.success()) {
            succeed(pipeline, apiResult.message());
        } else {
            fail(pipeline, apiResult.message());
        }
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        return history(result, null, null, null);
    }
}
