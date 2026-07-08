package com.mva.mwtool.devops.build;

import com.mva.mwtool.dto.BuildDto;

import java.util.List;

public interface BuildService {

    BuildDto getBuildById(String buildId);

    List<BuildDto> getBuildsByBranchAndRepo(String branch, String repoId);

    BuildDto createBuild(String branch, String repoId, String definitionId);
}
