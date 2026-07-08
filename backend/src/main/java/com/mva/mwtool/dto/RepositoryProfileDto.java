package com.mva.mwtool.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class RepositoryProfileDto {

    private String name;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String repoId;

    private String type;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String branch;

    private String buildDefinitionId;
    private String deploymentDefinitionId;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String environment;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String description;
}