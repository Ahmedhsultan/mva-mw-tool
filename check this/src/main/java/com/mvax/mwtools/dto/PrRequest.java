package com.mvax.mwtools.dto;

public record PrRequest(PatConfig patConfig, String repo, String releaseNumber, String branchName) {
}
