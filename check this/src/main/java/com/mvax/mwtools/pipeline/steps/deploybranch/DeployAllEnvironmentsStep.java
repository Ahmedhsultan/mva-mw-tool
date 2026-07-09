package com.mvax.mwtools.pipeline.steps.deploybranch;

import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DeployResult;
import com.mvax.mwtools.dto.DeployStatusResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Deploy step that runs deployments for:
 *   for each environment -> for each service
 */
public class DeployAllEnvironmentsStep extends PipelineStep {

    private final List<String> environments;
    private final List<String> services;

    private final Map<String, PipelineHistoryEntry.DeployTaskEntry> deployTaskMap = new ConcurrentHashMap<>();

    public void seedFromHistory(List<PipelineHistoryEntry.DeployTaskEntry> tasks) {
        deployTaskMap.clear();
        if (tasks == null) return;
        for (PipelineHistoryEntry.DeployTaskEntry t : tasks) {
            if (t == null || t.service() == null || t.env() == null) continue;
            deployTaskMap.put(t.service() + "::" + t.env(), t);
        }
    }

    public DeployAllEnvironmentsStep(List<String> environments, List<String> services) {
        super("deploy", "Deploy", "Deploy all services to all selected environments");
        this.environments = environments;
        this.services = services;
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        Map<String, Integer> buildIds = pipeline.getBuildIds();
        if (buildIds == null || buildIds.isEmpty()) {
            fail(pipeline, "No build IDs available – build step must run first");
            return;
        }

        for (String env : environments) {
            if (pipeline.isCancelled()) return;
            pipeline.emit("progress", "deploy-" + env, null, "Starting deployments to " + env + "...", null);
        }

        int taskCount = Math.max(0, environments.size() * services.size());
        int poolSize = Math.max(1, Math.min(taskCount, 12));
        ExecutorService executor = Executors.newFixedThreadPool(poolSize);

        try {
            List<CompletableFuture<Boolean>> futures = new ArrayList<>();

            for (String env : environments) {
                for (String svc : services) {
                    if (pipeline.isCancelled()) return;
                    futures.add(CompletableFuture.supplyAsync(() -> deployOne(pipeline, buildIds, env, svc), executor));
                }
            }

            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
            boolean allSucceeded = futures.stream().map(f -> {
                try {
                    return f.getNow(false);
                } catch (Exception e) {
                    return false;
                }
            }).allMatch(Boolean.TRUE::equals);

            if (pipeline.isCancelled()) return;

            if (allSucceeded) {
                succeed(pipeline, "All deployments completed successfully");
            } else {
                fail(pipeline, "Deployments completed with failures");
            }
        } finally {
            executor.shutdownNow();
            try {
                executor.awaitTermination(2, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private boolean deployOne(RunningPipeline pipeline, Map<String, Integer> buildIds, String env, String svc) {
        if (pipeline.isCancelled()) return false;

        String key = svc + "::" + env;
        PipelineHistoryEntry.DeployTaskEntry existing = deployTaskMap.get(key);
        if (existing != null) {
            // If this deployment already succeeded, skip.
            if ("success".equalsIgnoreCase(existing.status()) || "succeeded".equalsIgnoreCase(existing.phase())) {
                return true;
            }

            // If we already have a releaseId, just wait/poll it (resume mode).
            if (existing.releaseId() != null) {
                pipeline.emit("service-start", "deploy-" + env, svc,
                        "Reusing existing release #" + existing.releaseId() + " for " + svc + " to " + env, null);
                putDeployTask(svc, env, "running", existing.message(), existing.releaseId(), existing.releaseUrl(), existing.phase());

                ApiResult waitResult = pipeline.getAzureService()
                        .waitForDeployment(pipeline.getPatConfig(), existing.releaseId(), env,
                                progress -> {
                                    pipeline.emit("progress", "deploy-" + env, svc, progress, null);
                                    updatePhaseFromProgress(svc, env, progress);
                                },
                                pipeline::isCancelled);

                if (pipeline.isCancelled()) return false;

                if (waitResult.success()) {
                    pipeline.emit("service-success", "deploy-" + env, svc, waitResult.message(), null);
                    putDeployTask(svc, env, "success", waitResult.message(), existing.releaseId(), existing.releaseUrl(), "succeeded");
                    return true;
                }

                pipeline.emit("service-failed", "deploy-" + env, svc, waitResult.message(), null);
                putDeployTask(svc, env, "failed", waitResult.message(), existing.releaseId(), existing.releaseUrl(), "failed");
                return false;
            }
        }

        Integer buildId = buildIds.get(svc);
        if (buildId == null) {
            pipeline.emit("service-failed", "deploy-" + env, svc, "No build available for " + svc, null);
            putDeployTask(svc, env, "failed", "No build available for " + svc, null, null, "failed");
            return false;
        }

        pipeline.emit("service-start", "deploy-" + env, svc, "Deploying " + svc + " to " + env, null);
        putDeployTask(svc, env, "running", "Deploying " + svc + " to " + env, null, null, "creating");

        DeployResult deployResult = pipeline.getAzureService().deploy(pipeline.getPatConfig(), buildId, env, svc);

        Map<String, Object> data = Map.of(
                "releaseId", deployResult.releaseId() != null ? deployResult.releaseId() : -1,
                "releaseUrl", deployResult.releaseUrl() != null ? deployResult.releaseUrl() : "",
                "releaseEnvironment", deployResult.releaseEnvironment() != null ? deployResult.releaseEnvironment() : env
        );

        if (!deployResult.success()) {
            pipeline.emit("service-failed", "deploy-" + env, svc, deployResult.message(), data);
            putDeployTask(svc, env, "failed", deployResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "failed");
            return false;
        }

        pipeline.emit("service-success", "deploy-" + env, svc, deployResult.message(), data);
        putDeployTask(svc, env, "running", deployResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "queued");

        if (deployResult.releaseId() == null) {
            pipeline.emit("service-failed", "deploy-" + env, svc, "Deploy started but no releaseId was returned", data);
            putDeployTask(svc, env, "failed", "Deploy started but no releaseId was returned", null, deployResult.releaseUrl(), "failed");
            return false;
        }

        ApiResult waitResult = pipeline.getAzureService()
                .waitForDeployment(pipeline.getPatConfig(), deployResult.releaseId(), env,
                        progress -> {
                            pipeline.emit("progress", "deploy-" + env, svc, progress, null);
                            updatePhaseFromProgress(svc, env, progress);
                        },
                        pipeline::isCancelled);

        if (pipeline.isCancelled()) return false;

        if (waitResult.success()) {
            pipeline.emit("service-success", "deploy-" + env, svc, waitResult.message(), null);
            putDeployTask(svc, env, "success", waitResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "succeeded");
            return true;
        }

        pipeline.emit("service-failed", "deploy-" + env, svc, waitResult.message(), null);
        putDeployTask(svc, env, "failed", waitResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "failed");
        return false;
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        List<PipelineHistoryEntry.DeployTaskEntry> ordered = new ArrayList<>();

        for (String env : environments) {
            for (String svc : services) {
                PipelineHistoryEntry.DeployTaskEntry e = deployTaskMap.get(svc + "::" + env);
                if (e != null) ordered.add(e);
            }
        }

        // Include any unexpected keys (should be none) to avoid losing data.
        for (PipelineHistoryEntry.DeployTaskEntry e : deployTaskMap.values()) {
            if (e == null) continue;
            boolean alreadyIncluded = ordered.stream().anyMatch(x -> x != null
                    && Objects.equals(x.service(), e.service())
                    && Objects.equals(x.env(), e.env()));
            if (!alreadyIncluded) ordered.add(e);
        }

        return history(null, null, null, ordered);
    }

    @Override
    public boolean refresh(RunningPipeline pipeline) {
        boolean didSomething = false;

        for (PipelineHistoryEntry.DeployTaskEntry t : new ArrayList<>(deployTaskMap.values())) {
            if (t == null || t.releaseId() == null) continue;
            didSomething = true;

            DeployStatusResult status = pipeline.getAzureService()
                    .checkDeploymentStatus(pipeline.getPatConfig(), t.releaseId(), t.env());

            if (status == null) continue;

            if (status.done()) {
                String msg = "Release #" + t.releaseId() + " deployment " + status.statusName();
                putDeployTask(t.service(), t.env(), status.success() ? "success" : "failed", msg, t.releaseId(), t.releaseUrl(),
                        status.success() ? "succeeded" : "failed");

                pipeline.emit(status.success() ? "service-success" : "service-failed", "deploy-" + t.env(), t.service(), msg, null);
            } else {
                String msg = "Release #" + t.releaseId() + " deployment " + status.statusName() + "...";
                putDeployTask(t.service(), t.env(), "running", msg, t.releaseId(), t.releaseUrl(), "deploying");
                pipeline.emit("progress", "deploy-" + t.env(), t.service(), msg, null);
            }
        }

        return didSomething;
    }

    private void putDeployTask(
            String service,
            String env,
            String status,
            String message,
            Integer releaseId,
            String releaseUrl,
            String phase
    ) {
        String key = service + "::" + env;
        deployTaskMap.compute(key, (k, existing) -> {
            Integer rid = releaseId != null ? releaseId : (existing != null ? existing.releaseId() : null);
            String rurl = releaseUrl != null ? releaseUrl : (existing != null ? existing.releaseUrl() : null);
            String ph = phase != null ? phase : (existing != null ? existing.phase() : null);
            String msg = message != null ? message : (existing != null ? existing.message() : null);
            String st = status != null ? status : (existing != null ? existing.status() : null);

            return new PipelineHistoryEntry.DeployTaskEntry(
                    service,
                    env,
                    Objects.requireNonNullElse(st, "running"),
                    Objects.requireNonNullElse(msg, ""),
                    rid,
                    rurl,
                    ph
            );
        });
    }

    private void updatePhaseFromProgress(String service, String env, String progress) {
        if (progress == null) return;
        String p = progress.toLowerCase();

        String phase = null;
        if (p.contains("approved")) phase = "approved";
        else if (p.contains("deployment")) phase = "deploying";

        if (phase != null) {
            putDeployTask(service, env, "running", progress, null, null, phase);
        }
    }
}
