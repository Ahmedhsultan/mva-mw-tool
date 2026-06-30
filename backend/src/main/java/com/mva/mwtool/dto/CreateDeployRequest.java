package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;

public class CreateDeployRequest {

    @NotBlank
    private String buildId;

    @NotBlank
    private String definitionId;

    @NotBlank
    private String environment;

    private String description;

    public CreateDeployRequest() {}

    public String getBuildId() { return buildId; }
    public void setBuildId(String buildId) { this.buildId = buildId; }
    public String getDefinitionId() { return definitionId; }
    public void setDefinitionId(String definitionId) { this.definitionId = definitionId; }
    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
