package com.mvax.mwtools.pipeline.steps.cutoff;

import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.dto.PrResult;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;
import com.mvax.mwtools.pipeline.cutoff.CutoffServiceInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static com.mvax.mwtools.pipeline.cutoff.CutoffStepSupport.releaseBranch;

public class CreatePullRequestsStep extends PipelineStep {

    private final String releaseNumber;
    private final List<String> services;
    private final boolean enabled;
    private final Map<String, CutoffServiceInfo> serviceInfos;

    private final List<PipelineHistoryEntry.TaskEntry> tasks = new ArrayList<>();

    public CreatePullRequestsStep(String releaseNumber,
                                 List<String> services,
                                 Map<String, CutoffServiceInfo> serviceInfos,
                                 boolean enabled) {
        super("create-pr", "Create Pull Request", "Create PR from release branch to master");
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
            log("Creating PR " + branch + " -> master for " + svc);
            pipeline.emit("service-start", getId(), svc, "Creating PR for " + svc, null);

            PrResult res = pipeline.getAzureService().createPullRequest(pipeline.getPatConfig(), svc, releaseNumber, branch);
            Map<String, Object> data = Map.of(
                    "prUrl", res.prUrl() != null ? res.prUrl() : "",
                    "prId", res.prId() != null ? res.prId() : -1
            );

            if (res.success()) {
                pipeline.emit("service-success", getId(), svc, res.message(), data);
                tasks.add(new PipelineHistoryEntry.TaskEntry(svc, "success", res.message(), null, null));
            } else {
                allOk = false;
                pipeline.emit("service-failed", getId(), svc, res.message(), data);
                tasks.add(new PipelineHistoryEntry.TaskEntry(svc, "failed", res.message(), null, null));
            }
        }

        if (allOk) succeed(pipeline, "Pull requests created");
        else fail(pipeline, "One or more PRs failed");
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        return history(null, tasks, null, null);
    }
}
