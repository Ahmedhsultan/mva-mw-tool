package com.mva.mwtool.devops.repo;

import com.mva.mwtool.dto.RepoFileDto;

public interface RepoService {

    RepoFileDto pullFile(String repoId, String filePath, String branch);

    void pushFile(String repoId, String filePath, String branch, String content, String commitMessage);
}
