package com.mvax.mwtools.pipeline.steps.cutoff;

import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DeployResult;
import com.mvax.mwtools.dto.DeployStatusResult;
import com.mvax.mwtools.dto.LatestBuildResult;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;
import com.mvax.mwtools.pipeline.cutoff.CutoffServiceInfo;

import java.util.*;

import static com.mvax.mwtools.pipeline.cutoff.CutoffStepSupport.*;

/**
 * Deploy a specific build variant to the cutoff environment.
 * Variant is one of: "drop db" (expected failure), "master", "release".
 */
public class DeployCutoffVariantStep extends PipelineStep {

    private final String label;
    private final String releaseNumber;
    private final String environment;
    private final List<String> services;
    private final String variant;
    private final boolean enabled;
    private final Map<String, CutoffServiceInfo> serviceInfos;
    private final boolean requireApproval;

    private final Map<String, PipelineHistoryEntry.DeployTaskEntry> deployTaskMap = new LinkedHashMap<>();

    public DeployCutoffVariantStep(
            String stepId,
            String label,
            String releaseNumber,
            String environment,
            List<String> services,
            String variant,
            Map<String, CutoffServiceInfo> serviceInfos,
            boolean enabled,
            boolean requireApproval
    ) {
        super(stepId, label, "Deploy " + variant + " build to " + (environment != null ? environment.toUpperCase() : "environment"));
        this.label = label;
        this.releaseNumber = releaseNumber;
        this.environment = environment;
        this.services = services;
        this.variant = variant;
        this.serviceInfos = serviceInfos;
        this.enabled = enabled;
        this.requireApproval = requireApproval;
    }

    public void seedFromHistory(List<PipelineHistoryEntry.DeployTaskEntry> tasks) {
        deployTaskMap.clear();
        if (tasks == null) return;
        for (PipelineHistoryEntry.DeployTaskEntry t : tasks) {
            if (t == null || t.service() == null || t.env() == null) continue;
            deployTaskMap.put(t.service() + "::" + t.env(), t);
        }
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        if (!enabled) {
            skip(pipeline, "Disabled");
            return;
        }

        // Manual approval gate for deploy-release
        if (requireApproval) {
            waitForApproval(pipeline, "Waiting for user approval to deploy release build");
            pipeline.emit("approval-required", getId(), null, "Waiting for approval to deploy release build", null);

            boolean approved = pipeline.requestApproval();
            if (pipeline.isCancelled()) return;

            if (approved) {
                pipeline.emit("approval-granted", getId(), null, "User approved — continuing", null);
                log("Approved — continuing");
            } else {
                pipeline.emit("approval-rejected", getId(), null, "User rejected — stopping", null);
                fail(pipeline, "Rejected");
                return;
            }
        }

        boolean allOk = true;

        for (String svc : services) {
            if (pipeline.isCancelled()) return;

            if (isLibrary(svc, serviceInfos)) {
                putDeployTask(svc, environment, "skipped", "Library — no deployment needed", null, null, "skipped");
                pipeline.emit("service-success", getId(), svc, "Skipped (library)", null);
                continue;
            }

            if ("drop db".equalsIgnoreCase(variant)) {
                String dropBranch = dropDbBranch(svc, serviceInfos);
                if (dropBranch == null || dropBranch.isBlank()) {
                    putDeployTask(svc, environment, "skipped", "No drop DB branch configured", null, null, "skipped");
                    pipeline.emit("service-success", getId(), svc, "Skipped (no drop DB branch)", null);
                    continue;
                }
            }

            String key = svc + "::" + environment;
            PipelineHistoryEntry.DeployTaskEntry existing = deployTaskMap.get(key);
            if (existing != null) {
                if ("skipped".equalsIgnoreCase(existing.status())) {
                    pipeline.emit("service-success", getId(), svc, "Skipped (from history)", null);
                    continue;
                }

                // If this deployment already succeeded, skip.
                if ("success".equalsIgnoreCase(existing.status()) || "succeeded".equalsIgnoreCase(existing.phase())) {
                    pipeline.emit("service-success", getId(), svc, "Already deployed", null);
                    continue;
                }

                // If we already have a releaseId, just wait/poll it (resume mode).
                if (existing.releaseId() != null) {
                    pipeline.emit("service-start", getId(), svc,
                            "Reusing existing release #" + existing.releaseId() + " for " + svc + " to " + environment, null);
                    putDeployTask(svc, environment, "running", existing.message(), existing.releaseId(), existing.releaseUrl(), existing.phase());

                    ApiResult waitResult = pipeline.getAzureService().waitForDeployment(
                            pipeline.getPatConfig(),
                            existing.releaseId(),
                            environment,
                            progress -> pipeline.emit("progress", getId(), svc, progress, null),
                            pipeline::isCancelled
                    );

                    if (pipeline.isCancelled()) return;

                    // Drop DB: expected failure counts as success
                    if ("drop db".equalsIgnoreCase(variant)) {
                        String msg = !waitResult.success()
                                ? ("✓ Expected failure confirmed — " + waitResult.message())
                                : ("⚠ Unexpected success — " + waitResult.message());
                        pipeline.emit("service-success", getId(), svc, msg, null);
                        putDeployTask(svc, environment, "success", msg, existing.releaseId(), existing.releaseUrl(), waitResult.success() ? "succeeded" : "failed");
                        continue;
                    }

                    if (waitResult.success()) {
                        pipeline.emit("service-success", getId(), svc, waitResult.message(), null);
                        putDeployTask(svc, environment, "success", waitResult.message(), existing.releaseId(), existing.releaseUrl(), "succeeded");
                    } else {
                        pipeline.emit("service-failed", getId(), svc, waitResult.message(), null);
                        putDeployTask(svc, environment, "failed", waitResult.message(), existing.releaseId(), existing.releaseUrl(), "failed");
                        allOk = false;
                    }
                    continue;
                }
            }

            Integer buildId = findBuildIdForServiceVariant(pipeline, svc);
            if (buildId == null) {
                pipeline.emit("service-failed", getId(), svc, "No build ID found for " + svc + " (" + variant + ")", null);
                putDeployTask(svc, environment, "failed", "No build ID found", null, null, "failed");
                allOk = false;
                continue;
            }

            pipeline.emit("service-start", getId(), svc, "Deploying " + svc + " (" + variant + ") to " + environment, null);
            putDeployTask(svc, environment, "running", "Deploying...", null, null, "creating");

            DeployResult deployResult = pipeline.getAzureService().deploy(pipeline.getPatConfig(), buildId, environment, svc);
            Map<String, Object> data = Map.of(
                    "releaseId", deployResult.releaseId() != null ? deployResult.releaseId() : -1,
                    "releaseUrl", deployResult.releaseUrl() != null ? deployResult.releaseUrl() : "",
                    "releaseEnvironment", deployResult.releaseEnvironment() != null ? deployResult.releaseEnvironment() : environment
            );

            if (!deployResult.success()) {
                // Drop DB: failing to create release is a skip (same as frontend behavior)
                if ("drop db".equalsIgnoreCase(variant)) {
                    pipeline.emit("service-success", getId(), svc, "Could not create release (skipped): " + deployResult.message(), data);
                    putDeployTask(svc, environment, "skipped", "Could not create release: " + deployResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "skipped");
                    continue;
                }

                pipeline.emit("service-failed", getId(), svc, deployResult.message(), data);
                putDeployTask(svc, environment, "failed", deployResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "failed");
                allOk = false;
                continue;
            }

            pipeline.emit("service-success", getId(), svc, deployResult.message(), data);
            putDeployTask(svc, environment, "running", deployResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "queued");

            if (deployResult.releaseId() != null) {
                ApiResult waitResult = pipeline.getAzureService().waitForDeployment(
                        pipeline.getPatConfig(),
                        deployResult.releaseId(),
                        environment,
                        progress -> pipeline.emit("progress", getId(), svc, progress, null),
                        pipeline::isCancelled
                );

                if (pipeline.isCancelled()) return;

                // Drop DB: expected failure counts as success
                if ("drop db".equalsIgnoreCase(variant)) {
                    String msg = !waitResult.success()
                            ? ("✓ Expected failure confirmed — " + waitResult.message())
                            : ("⚠ Unexpected success — " + waitResult.message());
                    pipeline.emit("service-success", getId(), svc, msg, null);
                    putDeployTask(svc, environment, "success", msg, deployResult.releaseId(), deployResult.releaseUrl(), waitResult.success() ? "succeeded" : "failed");
                    continue;
                }

                if (waitResult.success()) {
                    pipeline.emit("service-success", getId(), svc, waitResult.message(), null);
                    putDeployTask(svc, environment, "success", waitResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "succeeded");
                } else {
                    pipeline.emit("service-failed", getId(), svc, waitResult.message(), null);
                    putDeployTask(svc, environment, "failed", waitResult.message(), deployResult.releaseId(), deployResult.releaseUrl(), "failed");
                    allOk = false;
                }
            }
        }

        if (allOk) succeed(pipeline, label + " done");
        else fail(pipeline, label + " failed");
    }

    private Integer findBuildIdForServiceVariant(RunningPipeline pipeline, String svc) {
        // Preferred: build IDs from build step
        Map<String, Integer> buildIds = pipeline.getBuildIds();
        if (buildIds != null) {
            String key = buildKey(svc, variant);
            Integer id = buildIds.get(key);
            if (id != null) return id;
        }

        // Fallback: latest build
        String branch;
        if ("master".equalsIgnoreCase(variant)) {
            branch = "master";
        } else if ("drop db".equalsIgnoreCase(variant)) {
            branch = dropDbBranch(svc, serviceInfos);
            if (branch == null) return null;
        } else {
            branch = releaseBranch(svc, releaseNumber, serviceInfos);
        }

        LatestBuildResult latest = pipeline.getAzureService().getLatestBuild(pipeline.getPatConfig(), svc, branch);
        return latest != null ? latest.buildId() : null;
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        // Deterministic order: services as selected
        List<PipelineHistoryEntry.DeployTaskEntry> ordered = new ArrayList<>();
        for (String svc : services) {
            PipelineHistoryEntry.DeployTaskEntry e = deployTaskMap.get(svc + "::" + environment);
            if (e != null) ordered.add(e);
        }
        for (PipelineHistoryEntry.DeployTaskEntry e : deployTaskMap.values()) {
            if (e == null) continue;
            boolean already = ordered.stream().anyMatch(x -> x != null && Objects.equals(x.service(), e.service()) && Objects.equals(x.env(), e.env()));
            if (!already) ordered.add(e);
        }
        return history(null, null, null, ordered);
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

    @Override
    public boolean refresh(RunningPipeline pipeline) {
        boolean didSomething = false;

        for (PipelineHistoryEntry.DeployTaskEntry t : new ArrayList<>(deployTaskMap.values())) {
            if (t == null || t.releaseId() == null) continue;
            didSomething = true;

            DeployStatusResult status = pipeline.getAzureService().checkDeploymentStatus(
                    pipeline.getPatConfig(),
                    t.releaseId(),
                    t.env()
            );

            if (status == null) continue;

            if (status.done()) {
                // Drop DB: expected failure counts as success (same as execute path)
                if ("drop db".equalsIgnoreCase(variant)) {
                    String msg = !status.success()
                            ? ("✓ Expected failure confirmed — Release #" + t.releaseId() + " " + status.statusName())
                            : ("⚠ Unexpected success — Release #" + t.releaseId() + " " + status.statusName());
                    putDeployTask(t.service(), t.env(), "success", msg, t.releaseId(), t.releaseUrl(),
                            status.success() ? "succeeded" : "failed");
                    pipeline.emit("service-success", getId(), t.service(), msg, null);
                } else {
                    String msg = "Release #" + t.releaseId() + " deployment " + status.statusName();
                    putDeployTask(t.service(), t.env(), status.success() ? "success" : "failed", msg, t.releaseId(), t.releaseUrl(),
                            status.success() ? "succeeded" : "failed");
                    pipeline.emit(status.success() ? "service-success" : "service-failed", getId(), t.service(), msg, null);
                }
            } else {
                String msg = "Release #" + t.releaseId() + " deployment " + status.statusName() + "...";
                putDeployTask(t.service(), t.env(), "running", msg, t.releaseId(), t.releaseUrl(), "deploying");
                pipeline.emit("progress", getId(), t.service(), msg, null);
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
        PipelineHistoryEntry.DeployTaskEntry existing = deployTaskMap.get(key);
        Integer rid = releaseId != null ? releaseId : (existing != null ? existing.releaseId() : null);
        String rurl = releaseUrl != null ? releaseUrl : (existing != null ? existing.releaseUrl() : null);
        String ph = phase != null ? phase : (existing != null ? existing.phase() : null);

        deployTaskMap.put(key, new PipelineHistoryEntry.DeployTaskEntry(
                service,
                env,
                status,
                message,
                rid,
                rurl,
                ph
        ));
    }
}
