package com.mva.mwtool.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
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
    private List<String> repositories;
    private List<RepositoryProfileDto> repoProfiles;
}