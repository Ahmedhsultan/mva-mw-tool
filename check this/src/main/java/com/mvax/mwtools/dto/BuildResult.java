package com.mvax.mwtools.dto;

public record BuildResult(boolean success, String message, Integer buildId, String buildUrl) {
}
