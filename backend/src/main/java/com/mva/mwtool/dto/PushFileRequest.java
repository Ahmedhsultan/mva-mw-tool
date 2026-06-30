package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;

public class PushFileRequest {

    @NotBlank
    private String repoId;

    @NotBlank
    private String filePath;

    @NotBlank
    private String branch;

    @NotBlank
    private String content;

    @NotBlank
    private String commitMessage;

    public PushFileRequest() {}

    public String getRepoId() { return repoId; }
    public void setRepoId(String repoId) { this.repoId = repoId; }
    public String getFilePath() { return filePath; }
    public void setFilePath(String filePath) { this.filePath = filePath; }
    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getCommitMessage() { return commitMessage; }
    public void setCommitMessage(String commitMessage) { this.commitMessage = commitMessage; }
}
