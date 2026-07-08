package com.mva.mwtool.devops;

import com.mva.mwtool.devops.auth.AuthService;
import com.mva.mwtool.devops.build.BuildService;
import com.mva.mwtool.devops.deploy.DeployService;
import com.mva.mwtool.devops.repo.RepoService;
import com.mva.mwtool.dto.DevOpsCredentials;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class DevOpsContext {
    private final String provider;
    private final DevOpsCredentials credentials;
    private final AuthService authService;
    private final BuildService buildService;
    private final DeployService deployService;
    private final RepoService repoService;
}

