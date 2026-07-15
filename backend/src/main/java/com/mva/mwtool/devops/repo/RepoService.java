package com.mva.mwtool.devops.repo;

import com.mva.mwtool.dto.PrDto;
import com.mva.mwtool.dto.RepoFileDto;

import java.util.List;

public interface RepoService {

    RepoFileDto pullFile(String repoId, String filePath, String branch);

    List<String> listFilePaths(String repoId, String directoryPath, String branch);

    void pushFile(String repoId, String filePath, String branch, String content, String commitMessage);

    void deleteFile(String repoId, String filePath, String branch, String commitMessage);

    PrDto createPullRequest(String repoId, String sourceBranch, String targetBranch, String title, String description);

    void createBranch(String repoId, String newBranch, String sourceBranch);
}
