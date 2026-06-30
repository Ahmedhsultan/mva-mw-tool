package com.mva.mwtool.dto;

public class BuildDto {

    private String id;
    private String buildNumber;
    private String status;
    private String result;
    private String sourceBranch;
    private String definitionName;
    private String definitionId;
    private String url;

    public BuildDto() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getBuildNumber() { return buildNumber; }
    public void setBuildNumber(String buildNumber) { this.buildNumber = buildNumber; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getResult() { return result; }
    public void setResult(String result) { this.result = result; }
    public String getSourceBranch() { return sourceBranch; }
    public void setSourceBranch(String sourceBranch) { this.sourceBranch = sourceBranch; }
    public String getDefinitionName() { return definitionName; }
    public void setDefinitionName(String definitionName) { this.definitionName = definitionName; }
    public String getDefinitionId() { return definitionId; }
    public void setDefinitionId(String definitionId) { this.definitionId = definitionId; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
}
