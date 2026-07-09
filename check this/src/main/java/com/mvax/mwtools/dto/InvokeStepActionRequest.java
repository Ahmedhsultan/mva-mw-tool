package com.mvax.mwtools.dto;

/**
 * Optional request body for step-action calls.
 *
 * When invoking actions on a history run (not currently in memory), the backend needs a PAT to recreate
 * the pipeline run and continue execution.
 */
public record InvokeStepActionRequest(
        PatConfig patConfig
) {
}
