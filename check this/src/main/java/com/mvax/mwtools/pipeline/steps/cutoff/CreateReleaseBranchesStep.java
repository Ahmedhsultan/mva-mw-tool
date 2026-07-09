package com.mvax.mwtools.pipeline.steps.cutoff;

import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;
import com.mvax.mwtools.pipeline.cutoff.CutoffServiceInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.mvax.mwtools.pipeline.cutoff.CutoffStepSupport.releaseBranch;

public class CreateReleaseBranchesStep extends PipelineStep {

    private final String releaseNumber;
    private final List<String> services;
    private final boolean enabled;
    private final Map<String, CutoffServiceInfo> serviceInfos;

    private final List<PipelineHistoryEntry.TaskEntry> tasks = new ArrayList<>();

    public CreateReleaseBranchesStep(String releaseNumber,
                                    List<String> services,
                                    Map<String, CutoffServiceInfo> serviceInfos,
                                    boolean enabled) {
        super("create-branch", "Create Release Branch", "Create release branch for each selected repo");
        this.releaseNumber = releaseNumber;
        this.services = services;
        this.serviceInfos = serviceInfos;
        this.enabled = enabled;
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        if (!enabled) {
            skip(pipeline, "Disabled");
            return;
        }

        tasks.clear();
        boolean allOk = true;

        for (String svc : services) {
            if (pipeline.isCancelled()) return;

            String branch = releaseBranch(svc, releaseNumber, serviceInfos);
            log("Creating branch " + branch + " for " + svc);
            pipeline.emit("service-start", getId(), svc, "Creating branch " + branch, null);

            ApiResult res = pipeline.getAzureService().createBranch(pipeline.getPatConfig(), svc, releaseNumber, branch);

            if (res.success()) {
                pipeline.emit("service-success", getId(), svc, res.message(), null);
                tasks.add(new PipelineHistoryEntry.TaskEntry(svc, "success", res.message(), null, null));
            } else {
                allOk = false;
                pipeline.emit("service-failed", getId(), svc, res.message(), null);
                tasks.add(new PipelineHistoryEntry.TaskEntry(svc, "failed", res.message(), null, null));
            }
        }

        if (allOk) succeed(pipeline, "Release branches created");
        else fail(pipeline, "One or more branches failed");
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        return history(null, tasks, null, null);
    }
}
