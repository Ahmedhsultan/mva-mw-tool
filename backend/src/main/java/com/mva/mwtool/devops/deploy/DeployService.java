package com.mva.mwtool.devops.deploy;

import com.mva.mwtool.dto.DeployDto;

public interface DeployService {

    DeployDto getDeployById(String deployId, String environment);

    DeployDto createDeploy(String buildId, String definitionId, String environment, String description);
    
        java.util.List<String> listEnvironments(String definitionId);
}
