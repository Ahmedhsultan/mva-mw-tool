package com.mvax.mwtools.pipeline.steps.deploybranch;

import com.mvax.mwtools.dto.BranchCheckResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;

import java.util.ArrayList;
import java.util.List;

/** Verify that the target branch exists for every selected service. */
public class CheckBranchStep extends PipelineStep {

    private final String branch;
    private final List<String> services;
    private final List<PipelineHistoryEntry.TaskEntry> branchTasks = new ArrayList<>();

    public CheckBranchStep(String branch, List<String> services) {
        super("check-branch", "Check Branch", "Verifies the branch exists in each service repository");
        this.branch = branch;
        this.services = services;
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        boolean allExist = true;
        branchTasks.clear();

        for (String svc : services) {
            if (pipeline.isCancelled()) return;

            log("Checking branch '" + branch + "' in " + svc);
            pipeline.emit("service-start", getId(), svc, "Checking branch for " + svc, null);

            BranchCheckResult result = pipeline.getAzureService()
                    .checkBranchExists(pipeline.getPatConfig(), svc, null, branch);

            if (result.exists()) {
                pipeline.emit("service-success", getId(), svc, result.message(), null);
                branchTasks.add(new PipelineHistoryEntry.TaskEntry(svc, "success", result.message(), null, null));
            } else {
                pipeline.emit("service-failed", getId(), svc, result.message(), null);
                branchTasks.add(new PipelineHistoryEntry.TaskEntry(svc, "failed", result.message(), null, null));
                allExist = false;
            }
        }

        if (allExist) {
            succeed(pipeline, "Branch '" + branch + "' exists in all services");
        } else {
            fail(pipeline, "Branch '" + branch + "' missing in one or more services");
        }
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        return history(null, branchTasks, null, null);
    }
}
