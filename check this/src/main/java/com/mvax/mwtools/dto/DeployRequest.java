package com.mvax.mwtools.dto;

public record DeployRequest(PatConfig patConfig, int buildId, String environment, String repo) {
}
