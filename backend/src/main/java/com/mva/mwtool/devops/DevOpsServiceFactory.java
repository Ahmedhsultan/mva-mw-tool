package com.mva.mwtool.devops;

import com.mva.mwtool.devops.auth.*;
import com.mva.mwtool.devops.build.*;
import com.mva.mwtool.devops.deploy.*;
import com.mva.mwtool.devops.repo.*;
import com.mva.mwtool.dto.DevOpsCredentials;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
public class DevOpsServiceFactory {

    private final RestTemplate restTemplate;

    public DevOpsServiceFactory(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public DevOpsContext create(String provider, DevOpsCredentials credentials) {
        String key = provider.toLowerCase();
        return new DevOpsContext(
                key,
                credentials,
                createAuthService(key, credentials),
                createBuildService(key, credentials),
                createDeployService(key, credentials),
                createRepoService(key, credentials)
        );
    }

    private AuthService createAuthService(String provider, DevOpsCredentials credentials) {
        return switch (provider) {
            case "azure" -> new AzureAuthService(restTemplate, credentials);
            case "github" -> new GitHubAuthService(restTemplate, credentials);
            default -> throw new IllegalArgumentException("Unsupported provider: " + provider);
        };
    }

    private BuildService createBuildService(String provider, DevOpsCredentials credentials) {
        return switch (provider) {
            case "azure" -> new AzureBuildService(restTemplate, credentials);
            case "github" -> new GitHubBuildService(restTemplate, credentials);
            default -> throw new IllegalArgumentException("Unsupported provider: " + provider);
        };
    }

    private DeployService createDeployService(String provider, DevOpsCredentials credentials) {
        return switch (provider) {
            case "azure" -> new AzureDeployService(restTemplate, credentials);
            case "github" -> new GitHubDeployService(restTemplate, credentials);
            default -> throw new IllegalArgumentException("Unsupported provider: " + provider);
        };
    }

    private RepoService createRepoService(String provider, DevOpsCredentials credentials) {
        return switch (provider) {
            case "azure" -> new AzureRepoService(restTemplate, credentials);
            case "github" -> new GitHubRepoService(restTemplate, credentials);
            default -> throw new IllegalArgumentException("Unsupported provider: " + provider);
        };
    }
}
