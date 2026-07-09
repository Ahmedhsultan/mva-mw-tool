package com.mvax.mwtools.dto;

public record BuildRequest(PatConfig patConfig, String repo, String branch) {
}
