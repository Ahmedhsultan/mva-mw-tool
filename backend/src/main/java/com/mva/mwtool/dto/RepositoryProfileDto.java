package com.mva.mwtool.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class RepositoryProfileDto {

    private String name;
    private String repoId;
    private String type;
    private String branch;
    private String buildDefinitionId;
    private String deploymentDefinitionId;
    private String environment;
    private String description;
}