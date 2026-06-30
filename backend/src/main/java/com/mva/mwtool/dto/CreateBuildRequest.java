package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;

public class CreateBuildRequest {

    @NotBlank
    private String branch;

    @NotBlank
    private String repoId;

    @NotBlank
    private String definitionId;

    public CreateBuildRequest() {}

    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }
    public String getRepoId() { return repoId; }
    public void setRepoId(String repoId) { this.repoId = repoId; }
    public String getDefinitionId() { return definitionId; }
    public void setDefinitionId(String definitionId) { this.definitionId = definitionId; }
}
