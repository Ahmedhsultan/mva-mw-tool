package com.mvax.mwtools.pipeline.steps.deploybranch;

import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;

/** Validate the Azure DevOps PAT token. */
public class ValidatePatStep extends PipelineStep {

    private PipelineHistoryEntry.TaskEntry result;

    public ValidatePatStep() {
        super("validate-pat", "Validate PAT", "Validates the Azure DevOps personal access token");
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        log("Validating PAT credentials...");
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
