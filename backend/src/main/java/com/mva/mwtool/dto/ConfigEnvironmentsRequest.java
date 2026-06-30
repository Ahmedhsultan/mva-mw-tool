package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public class ConfigEnvironmentsRequest {

    @NotBlank
    private String repoId;

    @NotBlank
    private String branch;

    @NotNull
    private List<String> environments;

    public ConfigEnvironmentsRequest() {}

    public String getRepoId() { return repoId; }
    public void setRepoId(String repoId) { this.repoId = repoId; }
    public String getBranch() { return branch; }
    public void setBranch(String branch) { this.branch = branch; }
    public List<String> getEnvironments() { return environments; }
    public void setEnvironments(List<String> environments) { this.environments = environments; }
}