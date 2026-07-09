package com.mvax.mwtools.dto;

import java.util.List;

/**
 * Request to run a deploy-branch workflow server-side.
 * The backend runs this as a long-lived process and streams progress via SSE.
 */
public record DeployBranchRunRequest(
        PatConfig patConfig,
        String branch,
        List<String> services,
        List<String> environments
) {
}
