package com.mvax.mwtools.pipeline.steps.deploybranch;

import com.fasterxml.jackson.databind.JsonNode;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import com.mvax.mwtools.pipeline.RunningPipeline;
import com.mvax.mwtools.pipeline.steps.PipelineStep;
import com.mvax.mwtools.service.JsonDbService;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Check whether target environments have active reservations.
 * If any are reserved, the step waits for user approval before continuing.
 */
public class CheckReservationStep extends PipelineStep {

    private static final String RESERVATIONS_DIR = "db/reservations";
    private static final String DB_REPO = "MVAX-MW-Tools";
    private static final String DB_BRANCH = "main";

    private final List<String> environments;
    private final JsonDbService dbService;

    private final List<PipelineHistoryEntry.EnvTaskEntry> envTasks = new ArrayList<>();
    private PipelineHistoryEntry.TaskEntry approvalResult;

    public CheckReservationStep(List<String> environments, JsonDbService dbService) {
        super("check-env", "Check Environment", "Check if target environments are reserved");
        this.environments = environments;
        this.dbService = dbService;
    }

    @Override
    public void execute(RunningPipeline pipeline) {
        String today = LocalDate.now().toString();
        pipeline.emit("progress", getId(), null, "Loading reservation data...", null);
        List<JsonNode> reservations = loadReservations(pipeline);
        List<String> reservedEnvNames = new ArrayList<>();
        envTasks.clear();
        approvalResult = null;

        for (String env : environments) {
            if (pipeline.isCancelled()) return;

            pipeline.emit("service-start", getId(), env, "Checking reservations for " + env, null);

            List<String> reservedBy = new ArrayList<>();
            for (JsonNode r : reservations) {
                String rEnv = r.has("environment") ? r.get("environment").asText() : "";
                String startDate = r.has("startDate") ? r.get("startDate").asText() : "";
                String endDate = r.has("endDate") ? r.get("endDate").asText() : "";
                String userName = r.has("userName") ? r.get("userName").asText() : "unknown";

                if (rEnv.equalsIgnoreCase(env)
                        && startDate.compareTo(today) <= 0
                        && endDate.compareTo(today) >= 0) {
                    reservedBy.add(userName);
                }
            }

            if (!reservedBy.isEmpty()) {
                String names = String.join(", ", reservedBy);
                reservedEnvNames.add(env + " (by " + names + ")");
                log(env + " reserved by: " + names);
                pipeline.emit("service-failed", getId(), env,
                        "Reserved by: " + names,
                        Map.of("reservedBy", reservedBy));
                envTasks.add(new PipelineHistoryEntry.EnvTaskEntry(env, "warning", "Reserved by: " + names, reservedBy));
            } else {
                log(env + " is available");
                pipeline.emit("service-success", getId(), env, "Available", null);
                envTasks.add(new PipelineHistoryEntry.EnvTaskEntry(env, "success", "Available", List.of()));
            }
        }

        if (!reservedEnvNames.isEmpty()) {
            String detail = String.join("; ", reservedEnvNames);
            waitForApproval(pipeline, "Environments reserved: " + detail + " — approve to continue");
            pipeline.emit("approval-required", getId(), null,
                    "Environments reserved: " + detail,
                    Map.of("reservedEnvironments", reservedEnvNames));

            boolean approved = pipeline.requestApproval();
            if (pipeline.isCancelled()) return;

            if (approved) {
                pipeline.emit("approval-granted", getId(), null, "User approved — continuing", null);
                approvalResult = new PipelineHistoryEntry.TaskEntry("approval", "success", "Approved — continuing despite reservations", null, null);
                succeed(pipeline, "Approved — continuing despite reservations");
            } else {
                pipeline.emit("approval-rejected", getId(), null, "User rejected — cancelling pipeline", null);
                approvalResult = new PipelineHistoryEntry.TaskEntry("approval", "failed", "Rejected — environments are reserved", null, null);
                fail(pipeline, "User rejected — environments are reserved");
            }
        } else {
            succeed(pipeline, "All environments are available");
        }
    }

    @Override
    public PipelineHistoryEntry.StepHistory toHistory(RunningPipeline pipeline) {
        return history(approvalResult, null, envTasks, null);
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

    private List<JsonNode> loadReservations(RunningPipeline pipeline) {
        try {
            List<String> paths = dbService.listFiles(
                    pipeline.getPatConfig(), DB_REPO, DB_BRANCH, RESERVATIONS_DIR);
            List<JsonNode> records = new ArrayList<>();
            for (String path : paths) {
                JsonNode node = dbService.readFile(
                        pipeline.getPatConfig(), DB_REPO, DB_BRANCH, path);
                if (node != null) records.add(node);
            }
            return records;
        } catch (Exception e) {
            log("Failed to load reservations: " + e.getMessage());
            return List.of();
        }
    }
}
