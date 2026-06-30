package com.mva.mwtool.devops.build;

import com.mva.mwtool.dto.BuildDto;

import java.util.List;

public interface BuildService {

    BuildDto getBuildById(String pat, String organization, String project, String buildId);

    List<BuildDto> getBuildsByBranchAndRepo(String pat, String organization, String project,
                                            String branch, String repoId);

    BuildDto createBuild(String pat, String organization, String project,
                         String branch, String repoId, String definitionId);
}
