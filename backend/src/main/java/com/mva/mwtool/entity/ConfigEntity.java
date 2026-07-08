package com.mva.mwtool.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.mva.mwtool.dto.RepositoryProfileDto;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ConfigEntity {

    private List<String> environments;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private List<String> repositories;

    private List<RepositoryProfileDto> repoProfiles;
}