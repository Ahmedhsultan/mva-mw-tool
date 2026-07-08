package com.mva.mwtool.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class DevOpsCredentials {
    private AzureCredentials azure;
    private GitHubCredentials github;

    public String getPat(String provider) {
        return switch (provider.toLowerCase()) {
            case "azure" -> azure != null ? azure.getPat() : null;
            case "github" -> github != null ? github.getPat() : null;
            default -> throw new IllegalArgumentException("Unknown provider: " + provider);
        };
    }

    public String getOrganization(String provider) {
        return switch (provider.toLowerCase()) {
            case "azure" -> azure != null ? azure.getOrganization() : null;
            case "github" -> github != null ? github.getOrganization() : null;
            default -> throw new IllegalArgumentException("Unknown provider: " + provider);
        };
    }

    public String getProject(String provider) {
        return switch (provider.toLowerCase()) {
            case "azure" -> azure != null ? azure.getProject() : null;
            case "github" -> github != null ? github.getProject() : null;
            default -> throw new IllegalArgumentException("Unknown provider: " + provider);
        };
    }
}

