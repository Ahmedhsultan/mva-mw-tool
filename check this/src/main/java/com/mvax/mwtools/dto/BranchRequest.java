package com.mvax.mwtools.dto;

public record BranchRequest(PatConfig patConfig, String repo, String releaseNumber, String branchName) {
}
