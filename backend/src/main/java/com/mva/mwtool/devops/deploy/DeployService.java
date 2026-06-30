package com.mva.mwtool.devops.deploy;

import com.mva.mwtool.dto.DeployDto;

public interface DeployService {

    DeployDto getDeployById(String pat, String organization, String project, String deployId);

    DeployDto createDeploy(String pat, String organization, String project,
                           String buildId, String definitionId, String environment,
                           String description);
}
