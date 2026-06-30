package com.mva.mwtool.devops.repo;

import com.mva.mwtool.dto.RepoFileDto;

public interface RepoService {

    RepoFileDto pullFile(String pat, String organization, String project,
                         String repoId, String filePath, String branch);

    void pushFile(String pat, String organization, String project,
                  String repoId, String filePath, String branch,
                  String content, String commitMessage);
}
