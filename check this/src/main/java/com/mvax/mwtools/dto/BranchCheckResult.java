package com.mvax.mwtools.dto;

public record BranchCheckResult(boolean exists, String message, String prUrl, Integer prId) {
}
