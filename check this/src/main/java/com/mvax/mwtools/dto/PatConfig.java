package com.mvax.mwtools.dto;

/**
 * PAT configuration sent from the frontend for Azure DevOps operations.
 */
public record PatConfig(String organization, String project, String pat) {
}
