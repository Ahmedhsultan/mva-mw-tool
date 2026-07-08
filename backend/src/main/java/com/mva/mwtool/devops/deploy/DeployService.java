package com.mva.mwtool.devops.deploy;

import com.mva.mwtool.dto.DeployDto;

public interface DeployService {

    DeployDto getDeployById(String deployId);

    DeployDto createDeploy(String buildId, String definitionId, String environment, String description);
}
