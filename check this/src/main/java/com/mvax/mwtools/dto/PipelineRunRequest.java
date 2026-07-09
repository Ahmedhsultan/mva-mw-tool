package com.mvax.mwtools.dto;

import java.util.List;

/**
 * Request to run a full pipeline (create branch → PR → build → deploy) server-side.
 * The backend runs this as a long-lived process and streams progress via SSE.
 */
public record PipelineRunRequest(
        PatConfig patConfig,
        String releaseNumber,
        String environment,
        List<String> services,
        List<String> enabledSteps,
        List<String> enabledBuildCategories
) {
}
