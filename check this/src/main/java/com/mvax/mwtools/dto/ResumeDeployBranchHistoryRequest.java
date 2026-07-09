package com.mvax.mwtools.dto;

/**
 * Request to resume a previously saved deploy-branch run (history entry) back into the running pipeline list.
 *
 * The backend requires {@link PatConfig} to be provided (PAT is not stored in history for security).
 */
public record ResumeDeployBranchHistoryRequest(
        PatConfig patConfig,
        String fromStepId
) {
}
