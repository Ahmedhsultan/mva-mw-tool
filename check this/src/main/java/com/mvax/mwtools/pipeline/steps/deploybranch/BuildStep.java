package com.mvax.mwtools.pipeline.steps.deploybranch;

import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.BuildResult;
import com.mvax.mwtools.dto.BuildStatusResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Queue builds for every service on the given branch, then wait for all of them to complete.
 */
public class BuildStep extends PipelineStep {

    private final String branch;
    private final List<String> services;

    private final Map<String, PipelineHistoryEntry.TaskEntry> buildTaskMap = new LinkedHashMap<>();

    public void seedFromHistory(List<PipelineHistoryEntry.TaskEntry> tasks) {
        buildTaskMap.clear();
        if (tasks == null) return;
        for (PipelineHistoryEntry.TaskEntry t : tasks) {
            if (t == null || t.service() == null) continue;
            buildTaskMap.put(t.service(), t);
        }
    }

    public BuildStep(String branch, List<String> services) {
        super("build", "Build", "Queue and wait for builds on branch '" + branch + "'");
        this.branch = branch;
        this.services = services;
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        Map<String, Integer> buildIds = new HashMap<>();

        // If resuming, reuse any existing buildIds already known.
        Map<String, Integer> existing = pipeline.getBuildIds();
        if (existing != null && !existing.isEmpty()) {
            buildIds.putAll(existing);
        }

        // ── Queue builds ─────────────────────────────────────
        boolean allQueued = true;
        for (String svc : services) {
            if (pipeline.isCancelled()) return;

            // Resume mode: if we already have a buildId for this service, don't re-queue.
            Integer existingBuildId = buildIds.get(svc);
            if (existingBuildId != null && existingBuildId > 0) {
                PipelineHistoryEntry.TaskEntry existingTask = buildTaskMap.get(svc);
                if (existingTask == null) {
                    buildTaskMap.put(svc, new PipelineHistoryEntry.TaskEntry(
                            svc,
                            "running",
                            "Reusing existing build #" + existingBuildId,
                            existingBuildId,
                            null
                    ));
                }
                continue;
            }

            log("Queuing build for " + svc + " on " + branch);
            pipeline.emit("service-start", getId(), svc, "Queuing build for " + svc, null);

            BuildResult result = pipeline.getAzureService()
                    .queueBuild(pipeline.getPatConfig(), svc, branch);

            Map<String, Object> data = Map.of(
                    "buildId", result.buildId() != null ? result.buildId() : -1,
                    "buildUrl", result.buildUrl() != null ? result.buildUrl() : ""
            );

            if (result.success() && result.buildId() != null) {
                buildIds.put(svc, result.buildId());
                pipeline.emit("service-success", getId(), svc, result.message(), data);
                buildTaskMap.put(svc, new PipelineHistoryEntry.TaskEntry(
                        svc,
                        "running",
                        result.message(),
                        result.buildId(),
                        result.buildUrl()
                ));
            } else {
                allQueued = false;
                pipeline.emit("service-failed", getId(), svc, result.message(), data);
                buildTaskMap.put(svc, new PipelineHistoryEntry.TaskEntry(
                        svc,
                        "failed",
                        result.message(),
                        result.buildId(),
                        result.buildUrl()
                ));
            }
        }

        if (!allQueued) {
            fail(pipeline, "Some builds failed to queue");
            return;
        }

        // ── Wait for builds ──────────────────────────────────
        boolean allSucceeded = true;
        for (Map.Entry<String, Integer> entry : buildIds.entrySet()) {
            if (pipeline.isCancelled()) return;

            String svc = entry.getKey();
            int buildId = entry.getValue();

            log("Waiting for build #" + buildId + " (" + svc + ")");
            pipeline.emit("service-start", getId(), svc, "Waiting for build #" + buildId, null);

            ApiResult waitResult = pipeline.getAzureService()
                    .waitForBuild(pipeline.getPatConfig(), buildId,
                            progress -> pipeline.emit("progress", getId(), svc, progress, null),
                            pipeline::isCancelled);

            if (pipeline.isCancelled()) return;

            PipelineHistoryEntry.TaskEntry existingTask = buildTaskMap.get(svc);

            if (waitResult.success()) {
                pipeline.emit("service-success", getId(), svc, waitResult.message(), null);
                buildTaskMap.put(svc, new PipelineHistoryEntry.TaskEntry(
                        svc,
                        "success",
                        waitResult.message(),
                        existingTask != null ? existingTask.buildId() : buildId,
                        existingTask != null ? existingTask.buildUrl() : null
                ));
            } else {
                allSucceeded = false;
                pipeline.emit("service-failed", getId(), svc, waitResult.message(), null);
                buildTaskMap.put(svc, new PipelineHistoryEntry.TaskEntry(
                        svc,
                        "failed",
                        waitResult.message(),
                        existingTask != null ? existingTask.buildId() : buildId,
                        existingTask != null ? existingTask.buildUrl() : null
                ));
            }
        }

        pipeline.setBuildIds(buildIds);

        if (allSucceeded) {
            succeed(pipeline, "All builds succeeded");
        } else {
            fail(pipeline, "Some builds failed");
        }
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        return history(null, new ArrayList<>(buildTaskMap.values()), null, null);
    }

    @Override
    public boolean refresh(RunningPipeline pipeline) {
        boolean didSomething = false;

        for (PipelineHistoryEntry.TaskEntry t : new ArrayList<>(buildTaskMap.values())) {
            if (t == null || t.buildId() == null) continue;
            didSomething = true;

            BuildStatusResult status = pipeline.getAzureService().checkBuildStatus(pipeline.getPatConfig(), t.buildId());
            if (status == null) continue;

            if (status.done()) {
                String msg = status.success()
                        ? ("Build #" + t.buildId() + " succeeded")
                        : ("Build #" + t.buildId() + " " + (status.result() != null ? status.result() : "failed"));

                buildTaskMap.put(t.service(), new PipelineHistoryEntry.TaskEntry(
                        t.service(),
                        status.success() ? "success" : "failed",
                        msg,
                        t.buildId(),
                        t.buildUrl()
                ));

                pipeline.emit(status.success() ? "service-success" : "service-failed", getId(), t.service(), msg, null);
            } else {
                String msg = "Build #" + t.buildId() + ": " + status.status() + "...";
                buildTaskMap.put(t.service(), new PipelineHistoryEntry.TaskEntry(
                        t.service(),
                        "running",
                        msg,
                        t.buildId(),
                        t.buildUrl()
                ));
                pipeline.emit("progress", getId(), t.service(), msg, null);
            }
        }

        return didSomething;
    }
}
