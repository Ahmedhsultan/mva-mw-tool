package com.mvax.mwtools.dto;

public record DeployResult(boolean success, String message, Integer releaseId,
                           String releaseUrl, String releaseEnvironment) {
}
