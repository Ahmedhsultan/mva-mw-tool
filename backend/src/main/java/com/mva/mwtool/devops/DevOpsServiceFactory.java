package com.mva.mwtool.devops;

import com.mva.mwtool.devops.auth.AuthService;
import com.mva.mwtool.devops.build.BuildService;
import com.mva.mwtool.devops.deploy.DeployService;
import com.mva.mwtool.devops.repo.RepoService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class DevOpsServiceFactory {

    private final Map<String, AuthService> authServices;
    private final Map<String, BuildService> buildServices;
    private final Map<String, DeployService> deployServices;
    private final Map<String, RepoService> repoServices;

    public DevOpsServiceFactory(
            @Qualifier("azureAuthService") AuthService azureAuth,
            @Qualifier("githubAuthService") AuthService githubAuth,
            @Qualifier("azureBuildService") BuildService azureBuild,
            @Qualifier("githubBuildService") BuildService githubBuild,
            @Qualifier("azureDeployService") DeployService azureDeploy,
            @Qualifier("githubDeployService") DeployService githubDeploy,
            @Qualifier("azureRepoService") RepoService azureRepo,
            @Qualifier("githubRepoService") RepoService githubRepo) {
        this.authServices = Map.of("azure", azureAuth, "github", githubAuth);
        this.buildServices = Map.of("azure", azureBuild, "github", githubBuild);
        this.deployServices = Map.of("azure", azureDeploy, "github", githubDeploy);
        this.repoServices = Map.of("azure", azureRepo, "github", githubRepo);
    }

    public AuthService getAuthService(String provider) {
        return getService(authServices, provider);
    }

    public BuildService getBuildService(String provider) {
        return getService(buildServices, provider);
    }

    public DeployService getDeployService(String provider) {
        return getService(deployServices, provider);
    }

    public RepoService getRepoService(String provider) {
        return getService(repoServices, provider);
    }

    private <T> T getService(Map<String, T> services, String provider) {
        String key = provider.toLowerCase();
        T service = services.get(key);
        if (service == null) {
            throw new IllegalArgumentException("Unsupported provider: " + provider);
        }
        return service;
    }
}
