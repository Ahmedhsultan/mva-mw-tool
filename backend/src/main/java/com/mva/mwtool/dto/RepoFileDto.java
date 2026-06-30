package com.mva.mwtool.dto;

public class RepoFileDto {

    private String path;
    private String content;
    private String commitId;

    public RepoFileDto() {}

    public RepoFileDto(String path, String content, String commitId) {
        this.path = path;
        this.content = content;
        this.commitId = commitId;
    }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getCommitId() { return commitId; }
    public void setCommitId(String commitId) { this.commitId = commitId; }
}
