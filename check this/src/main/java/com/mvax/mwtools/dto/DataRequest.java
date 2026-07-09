package com.mvax.mwtools.dto;

/**
 * Request DTO for feature-specific data read/write operations.
 * Each feature controller knows its own file path, so filePath is not needed.
 *
 * @param patConfig Azure DevOps PAT credentials
 * @param repo      Repository name (e.g. "MVAX-MW-Tools")
 * @param branch    Branch name (e.g. "main")
 * @param data      JSON data to write (null for reads)
 * @param comment   Commit message (for writes, null for reads)
 */
public record DataRequest(
        PatConfig patConfig,
        String repo,
        String branch,
        Object data,
        String comment
) {
}
