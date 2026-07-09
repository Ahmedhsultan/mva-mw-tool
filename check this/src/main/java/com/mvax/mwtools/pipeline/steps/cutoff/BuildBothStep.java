package com.mvax.mwtools.pipeline.steps.cutoff;

import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.BuildResult;
import com.mvax.mwtools.dto.BuildStatusResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;
import com.mvax.mwtools.pipeline.cutoff.CutoffServiceInfo;

import java.util.*;

import static com.mvax.mwtools.pipeline.cutoff.CutoffStepSupport.*;

/**
 * Queue builds for release+master (+ optional drop-db) and wait for completion.
 * Azure builds run in parallel; this step queues all first, then waits.
 */
public class BuildBothStep extends PipelineStep {

    private final String releaseNumber;
    private final List<String> services;
    private final Set<String> enabledBuildCategories;
    private final boolean enabled;
    private final Map<String, CutoffServiceInfo> serviceInfos;

    private final Map<String, PipelineHistoryEntry.TaskEntry> buildTaskMap = new LinkedHashMap<>();

    public BuildBothStep(String releaseNumber,
                         List<String> services,
                         Set<String> enabledBuildCategories,
                         Map<String, CutoffServiceInfo> serviceInfos,
                         boolean enabled) {
        super("build-both", "Build Release & Master", "Queue and wait for builds (release/master/drop-db)");
        this.releaseNumber = releaseNumber;
        this.services = services;
        this.enabledBuildCategories = enabledBuildCategories;
        this.serviceInfos = serviceInfos;
        this.enabled = enabled;
    }

    public void seedFromHistory(List<PipelineHistoryEntry.TaskEntry> tasks) {
        buildTaskMap.clear();
        if (tasks == null) return;
        for (PipelineHistoryEntry.TaskEntry t : tasks) {
            if (t == null || t.service() == null) continue;
            buildTaskMap.put(t.service(), t);
        }
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        if (!enabled) {
            skip(pipeline, "Disabled");
            return;
        }

        if (enabledBuildCategories == null || enabledBuildCategories.isEmpty()) {
            skip(pipeline, "No build categories selected");
            return;
        }

        Map<String, Integer> buildIds = new HashMap<>();
        Map<String, Integer> existing = pipeline.getBuildIds();
        if (existing != null && !existing.isEmpty()) {
            buildIds.putAll(existing);
        }

        boolean allQueued = true;

        // ── Queue builds ─────────────────────────────────────
        for (String svc : services) {
            if (pipeline.isCancelled()) return;

            if (enabledBuildCategories.contains("release")) {
                queueVariant(pipeline, svc, "release", releaseBranch(svc, releaseNumber, serviceInfos), buildIds);
            }

            if (enabledBuildCategories.contains("master")) {
                queueVariant(pipeline, svc, "master", "master", buildIds);
            }

            if (enabledBuildCategories.contains("drop-db")) {
                String dropBranch = dropDbBranch(svc, serviceInfos);
                if (dropBranch != null && !dropBranch.isBlank()) {
                    queueVariant(pipeline, svc, "drop db", dropBranch, buildIds);
                }
            }
        }

        // Determine if any queued failed
        for (PipelineHistoryEntry.TaskEntry t : buildTaskMap.values()) {
            if (t != null && "failed".equalsIgnoreCase(t.status())) allQueued = false;
        }

        if (!allQueued) {
            pipeline.setBuildIds(buildIds);
            fail(pipeline, "Some builds failed to queue");
            return;
        }

        // ── Wait for builds ──────────────────────────────────
        boolean allSucceeded = true;
        for (Map.Entry<String, Integer> entry : buildIds.entrySet()) {
            if (pipeline.isCancelled()) return;

            String key = entry.getKey();
            int buildId = entry.getValue();

            // Only wait for builds we know about (those with our key format)
            String label = key.contains(":") ? buildLabel(key.split(":", 2)[0], key.split(":", 2)[1]) : key;

            pipeline.emit("service-start", getId(), label, "Waiting for build #" + buildId, null);

            ApiResult waitResult = pipeline.getAzureService().waitForBuild(
                    pipeline.getPatConfig(),
                    buildId,
                    progress -> pipeline.emit("progress", getId(), label, progress, null),
                    pipeline::isCancelled
            );

            PipelineHistoryEntry.TaskEntry existingTask = buildTaskMap.get(label);

            if (waitResult.success()) {
                pipeline.emit("service-success", getId(), label, waitResult.message(), null);
                buildTaskMap.put(label, new PipelineHistoryEntry.TaskEntry(
                        label,
                        "success",
                        waitResult.message(),
                        existingTask != null ? existingTask.buildId() : buildId,
                        existingTask != null ? existingTask.buildUrl() : null
                ));
            } else {
                allSucceeded = false;
                pipeline.emit("service-failed", getId(), label, waitResult.message(), null);
                buildTaskMap.put(label, new PipelineHistoryEntry.TaskEntry(
                        label,
                        "failed",
                        waitResult.message(),
                        existingTask != null ? existingTask.buildId() : buildId,
                        existingTask != null ? existingTask.buildUrl() : null
                ));
            }
        }

        pipeline.setBuildIds(buildIds);

        if (allSucceeded) succeed(pipeline, "All builds completed");
        else fail(pipeline, "Some builds failed");
    }

    private void queueVariant(RunningPipeline pipeline,
                              String svc,
                              String variant,
                              String branch,
                              Map<String, Integer> buildIds) {
        String key = buildKey(svc, variant);
        String label = buildLabel(svc, variant);

        Integer existingBuildId = buildIds.get(key);
        if (existingBuildId != null && existingBuildId > 0) {
            // Resume mode: reuse existing build id
            if (!buildTaskMap.containsKey(label)) {
                buildTaskMap.put(label, new PipelineHistoryEntry.TaskEntry(
                        label,
                        "running",
                        "Reusing existing build #" + existingBuildId,
                        existingBuildId,
                        null
                ));
            }
            return;
        }

        log("Queuing " + variant + " build for " + svc + " on " + branch);
        pipeline.emit("service-start", getId(), label, "Queuing " + variant + " build", null);

        BuildResult result = pipeline.getAzureService().queueBuild(pipeline.getPatConfig(), svc, branch);

        Map<String, Object> data = Map.of(
                "buildId", result.buildId() != null ? result.buildId() : -1,
                "buildUrl", result.buildUrl() != null ? result.buildUrl() : "",
                "buildType", variant
        );

        if (result.success() && result.buildId() != null) {
            buildIds.put(key, result.buildId());
            pipeline.emit("service-success", getId(), label, result.message(), data);
            buildTaskMap.put(label, new PipelineHistoryEntry.TaskEntry(
                    label,
                    "running",
                    result.message(),
                    result.buildId(),
                    result.buildUrl()
            ));
        } else {
            pipeline.emit("service-failed", getId(), label, result.message(), data);
            buildTaskMap.put(label, new PipelineHistoryEntry.TaskEntry(
                    label,
                    "failed",
                    result.message(),
                    result.buildId(),
                    result.buildUrl()
            ));
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
