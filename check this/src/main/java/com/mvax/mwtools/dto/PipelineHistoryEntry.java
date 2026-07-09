package com.mvax.mwtools.dto;

import java.util.List;

/**
 * A completed pipeline run persisted to disk as a JSON file.
 * Stores pipeline metadata and a list of step histories.
 * Each step is responsible for extracting its own history.
 */
public record PipelineHistoryEntry(
        String id,
        String type,
        String branch,
        List<String> services,
        List<String> environments,
        String startedAt,
        String finishedAt,
        String overallStatus, // "success" | "failed" | "cancelled"
        List<StepHistory> steps
) {

    /**
     * History for a single step. Optional fields are kept null/empty depending on step type.
     */
    public record StepHistory(
            String id,
            String label,
            String description,
            String status,
            List<String> logs,
            TaskEntry result,
            List<TaskEntry> tasks,
            List<EnvTaskEntry> envTasks,
            List<DeployTaskEntry> deployTasks
    ) {
    }

    /** Generic per-service task entry (branch check, build queue/wait, etc.). */
    public record TaskEntry(
            String service,
            String status,
            String message,
            Integer buildId,
            String buildUrl
    ) {
    }

    /** Per-service+environment deployment entry. */
    public record DeployTaskEntry(
            String service,
            String env,
            String status,
            String message,
            Integer releaseId,
            String releaseUrl,
            String phase
    ) {
    }

    /** Per-environment reservation status entry. */
    public record EnvTaskEntry(
            String env,
            String status,
            String message,
            List<String> reservedBy
    ) {
    }
}
