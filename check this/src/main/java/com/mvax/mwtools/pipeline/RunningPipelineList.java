package com.mvax.mwtools.pipeline;

import com.mvax.mwtools.dto.DeployBranchRunRequest;
import com.mvax.mwtools.dto.PatConfig;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.dto.PipelineRunRequest;
import com.mvax.mwtools.pipeline.cutoff.CutoffStepSupport;
import com.mvax.mwtools.pipeline.steps.PipelineStep;
import com.mvax.mwtools.pipeline.steps.deploybranch.BuildStep;
import com.mvax.mwtools.pipeline.steps.deploybranch.CheckBranchStep;
import com.mvax.mwtools.pipeline.steps.deploybranch.CheckReservationStep;
import com.mvax.mwtools.pipeline.steps.deploybranch.DeployAllEnvironmentsStep;
import com.mvax.mwtools.pipeline.steps.deploybranch.ValidatePatStep;
import com.mvax.mwtools.dto.PipelineStepStatus;
import com.mvax.mwtools.pipeline.steps.cutoff.*;
import com.mvax.mwtools.service.AzureDevOpsService;
import com.mvax.mwtools.service.JsonDbService;
import com.mvax.mwtools.service.PipelineHistoryService;
import com.mvax.mwtools.service.SettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.time.Instant;

/**
 * Manages all running pipelines and provides SSE subscriptions.
 * Extends {@link SseEmitter} so it can itself act as a broadcast emitter
 * for pipeline-list-level events (pipeline added, removed, status changed).
 */
@Component
public class RunningPipelineList extends SseEmitter {

    private static final Logger log = LoggerFactory.getLogger(RunningPipelineList.class);
    private static final long SSE_TIMEOUT = 120 * 60 * 1000L; // 2 hours

    private final ConcurrentHashMap<String, RunningPipeline> pipelines = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final AzureDevOpsService azureService;
    private final JsonDbService dbService;
    private final PipelineHistoryService historyService;
    private final SettingsService settingsService;

    public RunningPipelineList(AzureDevOpsService azureService,
                               JsonDbService dbService,
                               PipelineHistoryService historyService,
                               SettingsService settingsService) {
        super(SSE_TIMEOUT);
        this.azureService = azureService;
        this.dbService = dbService;
        this.historyService = historyService;
        this.settingsService = settingsService;
    }

    // ── Deploy-Branch Pipeline Factory ───────────────────────

    /**
     * Build the step list for a deploy-branch run and start it.
     * Returns the run ID immediately.
     */
    public String startDeployBranchRun(DeployBranchRunRequest request) {
        String runId = UUID.randomUUID().toString();

        List<PipelineStep> steps = new ArrayList<>();
        steps.add(new ValidatePatStep());
        steps.add(new CheckBranchStep(request.branch(), request.services()));
        steps.add(new CheckReservationStep(request.environments(), dbService));
        steps.add(new BuildStep(request.branch(), request.services()));
        steps.add(new DeployAllEnvironmentsStep(request.environments(), request.services()));

        RunningPipeline pipeline = new RunningPipeline(
            runId,
            "deploy-branch",
            request.branch(),
            request.services(),
            request.environments(),
            steps,
            azureService,
            request.patConfig());
        pipeline.setOnComplete(this::onPipelineComplete);
        pipelines.put(runId, pipeline);

        executor.submit(pipeline::run);
        log.info("Started deploy-branch pipeline {}", runId);
        return runId;
    }

        // ── Cutoff Pipeline Factory ─────────────────────────────

        public String startCutoffRun(PipelineRunRequest request) {
        String runId = UUID.randomUUID().toString();

        List<String> enabledSteps = request.enabledSteps() != null ? request.enabledSteps() : List.of();
        Set<String> enabledBuildCats = request.enabledBuildCategories() != null
            ? new HashSet<>(request.enabledBuildCategories())
            : Set.of();

        boolean stepValidate = enabledSteps.contains("validate-pat");
        boolean stepBranches = enabledSteps.contains("create-branch");
        boolean stepPrs = enabledSteps.contains("create-pr");
        boolean stepBuild = enabledSteps.contains("build-both");
        boolean stepDeployDrop = enabledSteps.contains("deploy-drop-db");
        boolean stepDeployMaster = enabledSteps.contains("deploy-master");
        boolean stepDeployRelease = enabledSteps.contains("deploy-release");

        // Load service configs to match frontend behavior (branch prefixes, library vs service, drop-db branch).
        var serviceInfos = settingsService.loadServiceInfos(request.patConfig());

        List<PipelineStep> steps = new ArrayList<>();
        steps.add(new ValidatePatIfEnabledStep(stepValidate));
        steps.add(new CreateReleaseBranchesStep(request.releaseNumber(), request.services(), serviceInfos, stepBranches));
        steps.add(new CreatePullRequestsStep(request.releaseNumber(), request.services(), serviceInfos, stepPrs));
        steps.add(new BuildBothStep(request.releaseNumber(), request.services(), enabledBuildCats, serviceInfos, stepBuild));
        steps.add(new DeployCutoffVariantStep("deploy-drop-db", "Deploy Drop DB", request.releaseNumber(), request.environment(),
            request.services(), "drop db", serviceInfos, stepDeployDrop, false));
        steps.add(new DeployCutoffVariantStep("deploy-master", "Deploy Master Build", request.releaseNumber(), request.environment(),
            request.services(), "master", serviceInfos, stepDeployMaster, false));
        steps.add(new DeployCutoffVariantStep("deploy-release", "Deploy Release Build", request.releaseNumber(), request.environment(),
            request.services(), "release", serviceInfos, stepDeployRelease, true));

        RunningPipeline pipeline = new RunningPipeline(
            runId,
            "cutoff",
            "release/primary/" + request.releaseNumber(),
            request.services(),
            List.of(request.environment()),
            steps,
            azureService,
            request.patConfig()
        );
        pipeline.setOnComplete(this::onPipelineComplete);
        pipelines.put(runId, pipeline);
        executor.submit(pipeline::run);
        log.info("Started cutoff pipeline {}", runId);
        return runId;
        }

    /**
     * Resume a previously-saved deploy-branch history entry back into the running list,
     * continuing execution from the provided step id.
     *
     * The resumed run reuses the same runId (history id) so history is overwritten/updated.
     */
    public String resumeDeployBranchRunFromHistory(String historyId, PatConfig patConfig, String fromStepId) {
        return resumeDeployBranchRunFromHistory(historyId, patConfig, fromStepId, "refresh");
    }

    public String resumeDeployBranchRunFromHistory(String historyId, PatConfig patConfig, String fromStepId, String action) {
        if (historyId == null || historyId.isBlank()) return null;
        if (patConfig == null) return null;

        RunningPipeline existing = pipelines.get(historyId);
        if (existing != null && !existing.isComplete()) return historyId;

        PipelineHistoryEntry base = historyService.load(historyId);
        if (base == null) return null;
        if (!"deploy-branch".equals(base.type())) return null;

        String a = action != null ? action.toLowerCase() : "refresh";
        boolean isRefresh = a.equals("refresh");
        boolean isRerun = a.equals("rerun") || a.equals("retry");

        String branch = base.branch();
        List<String> services = base.services() != null ? base.services() : List.of();
        List<String> environments = base.environments() != null ? base.environments() : List.of();

        // Create steps in the same order as the normal pipeline.
        ValidatePatStep validatePat = new ValidatePatStep();
        CheckBranchStep checkBranch = new CheckBranchStep(branch, services);
        CheckReservationStep checkReservation = new CheckReservationStep(environments, dbService);
        BuildStep build = new BuildStep(branch, services);
        DeployAllEnvironmentsStep deploy = new DeployAllEnvironmentsStep(environments, services);

        // Seed step internal state from history (so we can reuse buildIds/releaseIds).
        Map<String, PipelineHistoryEntry.StepHistory> baseSteps = new HashMap<>();
        if (base.steps() != null) {
            for (PipelineHistoryEntry.StepHistory s : base.steps()) {
                if (s != null && s.id() != null) baseSteps.put(s.id(), s);
            }
        }
        PipelineHistoryEntry.StepHistory baseBuild = baseSteps.get("build");
        PipelineHistoryEntry.StepHistory baseDeploy = baseSteps.get("deploy");

        // Decide what to reuse when resuming.
        // - refresh: reuse buildIds + releaseIds (poll existing)
        // - rerun build: queue new builds (do NOT reuse buildIds)
        // - rerun deploy: reuse buildIds but create new releases (do NOT reuse releaseIds)
        boolean reuseBuildIds = isRefresh || (isRerun && "deploy".equals(fromStepId));
        boolean reuseDeployIds = isRefresh;

        if (reuseBuildIds && baseBuild != null) {
            build.seedFromHistory(baseBuild.tasks());
        }
        if (reuseDeployIds && baseDeploy != null) {
            deploy.seedFromHistory(baseDeploy.deployTasks());
        }

        List<PipelineStep> steps = new ArrayList<>();
        steps.add(validatePat);
        steps.add(checkBranch);
        steps.add(checkReservation);
        steps.add(build);
        steps.add(deploy);

        Instant startedAt = Instant.now();
        try {
            if (base.startedAt() != null && !base.startedAt().isBlank()) {
                startedAt = Instant.parse(base.startedAt());
            }
        } catch (Exception ignored) {
            // keep now
        }

        RunningPipeline pipeline = new RunningPipeline(
                historyId,
                "deploy-branch",
                branch,
                services,
                environments,
                steps,
                azureService,
                patConfig,
                startedAt
        );
        pipeline.setBaseHistory(base);
        pipeline.setOnComplete(this::onPipelineComplete);

        // Seed pipeline buildIds from history build tasks (only when reusing builds).
        if (reuseBuildIds) {
            Map<String, Integer> seedBuildIds = new HashMap<>();
            if (baseBuild != null && baseBuild.tasks() != null) {
                for (PipelineHistoryEntry.TaskEntry t : baseBuild.tasks()) {
                    if (t == null || t.service() == null || t.buildId() == null) continue;
                    seedBuildIds.put(t.service(), t.buildId());
                }
            }
            if (!seedBuildIds.isEmpty()) {
                pipeline.setBuildIds(seedBuildIds);
            }
        }

        // Mark earlier steps as already done so the runner skips them.
        int startIndex = 0;
        if (fromStepId != null && !fromStepId.isBlank()) {
            for (int i = 0; i < steps.size(); i++) {
                if (fromStepId.equals(steps.get(i).getId())) {
                    startIndex = i;
                    break;
                }
            }
        }
        for (int i = 0; i < startIndex; i++) {
            steps.get(i).setStatus(PipelineStepStatus.SUCCESS);
        }
        // Ensure resuming step starts as pending.
        if (startIndex < steps.size()) {
            steps.get(startIndex).setStatus(PipelineStepStatus.PENDING);
        }

        pipelines.put(historyId, pipeline);
        executor.submit(pipeline::run);
        log.info("Resumed deploy-branch pipeline {} from step {} (action={})", historyId, fromStepId, action);
        return historyId;
    }

    // ── Subscriptions ────────────────────────────────────────

    /**
     * Subscribe to a specific pipeline's SSE stream.
     * Replays past events then streams live.
     */
    public SseEmitter subscribe(String runId) {
        RunningPipeline pipeline = pipelines.get(runId);
        if (pipeline == null) return null;
        return pipeline.subscribe(SSE_TIMEOUT);
    }

    // ── Pipeline Management ──────────────────────────────────

    public boolean cancelPipeline(String runId) {
        RunningPipeline pipeline = pipelines.get(runId);
        if (pipeline == null || pipeline.isComplete()) return false;
        pipeline.cancel();
        return true;
    }

    public boolean removePipeline(String runId) {
        RunningPipeline pipeline = pipelines.get(runId);
        if (pipeline == null) return false;
        if (!pipeline.isComplete()) pipeline.cancel();
        pipelines.remove(runId);
        return true;
    }

    public RunningPipeline getPipeline(String runId) {
        return pipelines.get(runId);
    }

    /**
     * Forward an approval / rejection to the pipeline's waiting step.
     */
    public boolean respondToApproval(String runId, boolean approved) {
        RunningPipeline pipeline = pipelines.get(runId);
        if (pipeline == null || !pipeline.isWaitingForApproval()) return false;
        pipeline.respondToApproval(approved);
        return true;
    }

    /**
     * Dispatch a user button click to a specific step.
     */
    public boolean invokeStepAction(String runId, String stepId, String action) {
        return invokeStepAction(runId, stepId, action, null);
    }

    /**
     * Dispatch a user button click to a specific step. If the run is not active but exists in history,
     * this can auto-resume the run back into memory and continue execution.
     */
    public boolean invokeStepAction(String runId, String stepId, String action, PatConfig patConfig) {
        RunningPipeline pipeline = pipelines.get(runId);

        // Auto-resume: if run is not active but exists in history, recreate it and continue.
        if (pipeline == null) {
            if (patConfig == null) return false;

            PipelineHistoryEntry base = historyService.load(runId);
            if (base == null) return false;

            // Only auto-resume on refresh/rerun-type actions.
            String a = action != null ? action.toLowerCase() : "";
            boolean canResumeAction = a.equals("refresh") || a.equals("retry") || a.equals("rerun");
            if (!canResumeAction) return false;

            if ("deploy-branch".equals(base.type())) {
                String resumedId = resumeDeployBranchRunFromHistory(runId, patConfig, stepId, action);
                return resumedId != null;
            }

            if ("cutoff".equals(base.type())) {
                String resumedId = resumeCutoffRunFromHistory(runId, patConfig, stepId, action);
                return resumedId != null;
            }

            return false;
        }

        for (PipelineStep step : pipeline.getSteps()) {
            if (step.getId().equals(stepId)) {
                return step.invokeAction(pipeline, action);
            }
        }
        return false;
    }

    /**
     * Resume a previously-saved cutoff history entry back into the running list,
     * continuing execution from the provided step id.
     */
    public String resumeCutoffRunFromHistory(String historyId, PatConfig patConfig, String fromStepId, String action) {
        if (historyId == null || historyId.isBlank()) return null;
        if (patConfig == null) return null;

        RunningPipeline existing = pipelines.get(historyId);
        if (existing != null && !existing.isComplete()) return historyId;

        PipelineHistoryEntry base = historyService.load(historyId);
        if (base == null) return null;
        if (!"cutoff".equals(base.type())) return null;

        String a = action != null ? action.toLowerCase() : "refresh";
        boolean isRefresh = a.equals("refresh");
        boolean isRerun = a.equals("rerun") || a.equals("retry");

        List<String> services = base.services() != null ? base.services() : List.of();
        List<String> environments = base.environments() != null ? base.environments() : List.of();
        String environment = !environments.isEmpty() ? environments.get(0) : null;

        String branch = base.branch();
        String releaseNumber = deriveReleaseNumber(branch);
        if (releaseNumber == null || releaseNumber.isBlank()) return null;

        Map<String, PipelineHistoryEntry.StepHistory> baseSteps = new HashMap<>();
        if (base.steps() != null) {
            for (PipelineHistoryEntry.StepHistory s : base.steps()) {
                if (s != null && s.id() != null) baseSteps.put(s.id(), s);
            }
        }

        // Enabled steps inferred from history (fallback: enable all known ids)
        Set<String> enabledStepIds = new HashSet<>(baseSteps.keySet());
        if (enabledStepIds.isEmpty()) {
            enabledStepIds.addAll(Set.of(
                    "validate-pat",
                    "create-branch",
                    "create-pr",
                    "build-both",
                    "deploy-drop-db",
                    "deploy-master",
                    "deploy-release"
            ));
        }

        PipelineHistoryEntry.StepHistory baseBuild = baseSteps.get("build-both");
        Set<String> enabledBuildCats = inferCutoffBuildCategories(baseBuild);

        var serviceInfos = settingsService.loadServiceInfos(patConfig);

        ValidatePatIfEnabledStep validatePat = new ValidatePatIfEnabledStep(enabledStepIds.contains("validate-pat"));
        CreateReleaseBranchesStep createBranches = new CreateReleaseBranchesStep(releaseNumber, services, serviceInfos, enabledStepIds.contains("create-branch"));
        CreatePullRequestsStep createPrs = new CreatePullRequestsStep(releaseNumber, services, serviceInfos, enabledStepIds.contains("create-pr"));
        BuildBothStep build = new BuildBothStep(releaseNumber, services, enabledBuildCats, serviceInfos, enabledStepIds.contains("build-both"));
        DeployCutoffVariantStep deployDrop = new DeployCutoffVariantStep("deploy-drop-db", "Deploy Drop DB", releaseNumber, environment,
                services, "drop db", serviceInfos, enabledStepIds.contains("deploy-drop-db"), false);
        DeployCutoffVariantStep deployMaster = new DeployCutoffVariantStep("deploy-master", "Deploy Master Build", releaseNumber, environment,
                services, "master", serviceInfos, enabledStepIds.contains("deploy-master"), false);
        DeployCutoffVariantStep deployRelease = new DeployCutoffVariantStep("deploy-release", "Deploy Release Build", releaseNumber, environment,
                services, "release", serviceInfos, enabledStepIds.contains("deploy-release"), true);

        // Decide what to reuse when resuming.
        // - refresh: reuse buildIds + releaseIds
        // - rerun deploy: reuse buildIds but create new releases
        boolean resumingDeploy = fromStepId != null && fromStepId.startsWith("deploy-");
        boolean reuseBuildIds = isRefresh || (isRerun && resumingDeploy);
        boolean reuseDeployIds = isRefresh;

        if (reuseBuildIds && baseBuild != null) {
            build.seedFromHistory(baseBuild.tasks());
        }

        if (reuseDeployIds) {
            PipelineHistoryEntry.StepHistory baseDrop = baseSteps.get("deploy-drop-db");
            PipelineHistoryEntry.StepHistory baseMaster = baseSteps.get("deploy-master");
            PipelineHistoryEntry.StepHistory baseRelease = baseSteps.get("deploy-release");
            if (baseDrop != null) deployDrop.seedFromHistory(baseDrop.deployTasks());
            if (baseMaster != null) deployMaster.seedFromHistory(baseMaster.deployTasks());
            if (baseRelease != null) deployRelease.seedFromHistory(baseRelease.deployTasks());
        }

        List<PipelineStep> steps = new ArrayList<>();
        steps.add(validatePat);
        steps.add(createBranches);
        steps.add(createPrs);
        steps.add(build);
        steps.add(deployDrop);
        steps.add(deployMaster);
        steps.add(deployRelease);

        Instant startedAt = Instant.now();
        try {
            if (base.startedAt() != null && !base.startedAt().isBlank()) {
                startedAt = Instant.parse(base.startedAt());
            }
        } catch (Exception ignored) {
        }

        RunningPipeline pipeline = new RunningPipeline(
                historyId,
                "cutoff",
                branch,
                services,
                environments,
                steps,
                azureService,
                patConfig,
                startedAt
        );
        pipeline.setBaseHistory(base);
        pipeline.setOnComplete(this::onPipelineComplete);

        if (reuseBuildIds && baseBuild != null && baseBuild.tasks() != null) {
            Map<String, Integer> seedBuildIds = parseCutoffBuildIdsFromTasks(baseBuild.tasks());
            if (!seedBuildIds.isEmpty()) {
                pipeline.setBuildIds(seedBuildIds);
            }
        }

        // Mark earlier steps as already done so the runner skips them.
        int startIndex = 0;
        if (fromStepId != null && !fromStepId.isBlank()) {
            for (int i = 0; i < steps.size(); i++) {
                if (fromStepId.equals(steps.get(i).getId())) {
                    startIndex = i;
                    break;
                }
            }
        }
        for (int i = 0; i < startIndex; i++) {
            steps.get(i).setStatus(PipelineStepStatus.SUCCESS);
        }
        if (startIndex < steps.size()) {
            steps.get(startIndex).setStatus(PipelineStepStatus.PENDING);
        }

        pipelines.put(historyId, pipeline);
        executor.submit(pipeline::run);
        log.info("Resumed cutoff pipeline {} from step {} (action={})", historyId, fromStepId, action);
        return historyId;
    }

    private String deriveReleaseNumber(String branch) {
        if (branch == null || branch.isBlank()) return null;
        int idx = branch.lastIndexOf('/');
        if (idx < 0 || idx == branch.length() - 1) return null;
        return branch.substring(idx + 1);
    }

    private Set<String> inferCutoffBuildCategories(PipelineHistoryEntry.StepHistory buildStep) {
        if (buildStep == null || buildStep.tasks() == null) {
            return new HashSet<>(Set.of("release", "master", "drop-db"));
        }

        boolean hasRelease = false;
        boolean hasMaster = false;
        boolean hasDropDb = false;
        for (PipelineHistoryEntry.TaskEntry t : buildStep.tasks()) {
            if (t == null || t.service() == null) continue;
            String s = t.service().toLowerCase();
            if (s.contains("(release)")) hasRelease = true;
            if (s.contains("(master)")) hasMaster = true;
            if (s.contains("(drop db)")) hasDropDb = true;
        }

        Set<String> out = new HashSet<>();
        if (hasRelease) out.add("release");
        if (hasMaster) out.add("master");
        if (hasDropDb) out.add("drop-db");
        if (out.isEmpty()) out.addAll(Set.of("release", "master", "drop-db"));
        return out;
    }

    private Map<String, Integer> parseCutoffBuildIdsFromTasks(List<PipelineHistoryEntry.TaskEntry> tasks) {
        Map<String, Integer> seed = new HashMap<>();
        if (tasks == null) return seed;

        for (PipelineHistoryEntry.TaskEntry t : tasks) {
            if (t == null || t.service() == null || t.buildId() == null) continue;
            String label = t.service();

            int open = label.lastIndexOf(" (");
            int close = label.lastIndexOf(')');
            if (open < 0 || close < 0 || close <= open + 2) continue;

            String svc = label.substring(0, open).trim();
            String variant = label.substring(open + 2, close).trim();
            if (svc.isBlank() || variant.isBlank()) continue;

            seed.put(CutoffStepSupport.buildKey(svc, variant), t.buildId());
        }

        return seed;
    }

    /**
     * Returns summary info for all active (non-complete) deploy-branch pipelines.
     */
    public List<Map<String, Object>> getActiveDeployBranchRuns() {
        List<Map<String, Object>> runs = new ArrayList<>();
        pipelines.forEach((id, pipeline) -> {
            if ("deploy-branch".equals(pipeline.getType()) && !pipeline.isComplete()) {
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("runId", pipeline.getId());
                info.put("type", pipeline.getType());
                info.put("status", pipeline.getStatus());
                info.put("startedAt", pipeline.getStartedAt().toString());
                info.put("waitingForApproval", pipeline.isWaitingForApproval());
                info.put("branch", pipeline.getBranch());
                info.put("services", pipeline.getServices());
                info.put("environments", pipeline.getEnvironments());
                runs.add(info);
            }
        });
        return runs;
    }

    public List<Map<String, Object>> getActiveCutoffRuns() {
        List<Map<String, Object>> runs = new ArrayList<>();
        pipelines.forEach((id, pipeline) -> {
            if ("cutoff".equals(pipeline.getType()) && !pipeline.isComplete()) {
                Map<String, Object> info = new LinkedHashMap<>();
                info.put("runId", pipeline.getId());
                info.put("type", pipeline.getType());
                info.put("status", pipeline.getStatus());
                info.put("startedAt", pipeline.getStartedAt().toString());
                info.put("waitingForApproval", pipeline.isWaitingForApproval());
                info.put("branch", pipeline.getBranch());
                info.put("services", pipeline.getServices());
                info.put("environments", pipeline.getEnvironments());
                runs.add(info);
            }
        });
        return runs;
    }

    /**
     * Returns summary info for a specific pipeline.
     */
    public Map<String, Object> getPipelineStatus(String runId) {
        RunningPipeline pipeline = pipelines.get(runId);
        if (pipeline == null) return null;
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("runId", pipeline.getId());
        status.put("type", pipeline.getType());
        status.put("status", pipeline.getStatus());
        status.put("complete", pipeline.isComplete());
        status.put("cancelled", pipeline.isCancelled());
        status.put("waitingForApproval", pipeline.isWaitingForApproval());
        status.put("branch", pipeline.getBranch());
        status.put("services", pipeline.getServices());
        status.put("environments", pipeline.getEnvironments());
        status.put("startedAt", pipeline.getStartedAt().toString());
        status.put("eventCount", pipeline.getEventLog().size());
        status.put("steps", buildStepsSummary(pipeline));
        return status;
    }

    private List<Map<String, Object>> buildStepsSummary(RunningPipeline pipeline) {
        List<Map<String, Object>> summaries = new ArrayList<>();
        for (PipelineStep step : pipeline.getSteps()) {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("id", step.getId());
            s.put("label", step.getLabel());
            s.put("status", step.getStatus().name());
            summaries.add(s);
        }
        return summaries;
    }

    // ── Auto-save history on completion ────────────────────────

    private void onPipelineComplete(RunningPipeline pipeline) {
        try {
            PipelineHistoryEntry entry = pipeline.buildHistoryEntry();
            boolean saved = historyService.save(entry);
            if (saved) {
                pipelines.remove(pipeline.getId());
                log.info("Auto-saved history and removed pipeline {}", pipeline.getId());
            } else {
                log.warn("History save failed; keeping pipeline {} in memory", pipeline.getId());
            }
        } catch (Exception e) {
            log.error("Failed to auto-save history for pipeline {}: {}", pipeline.getId(), e.getMessage());
        }
    }

}
