package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
public class ConfigDataRequest {

    private String repoId;

    private String branch;

    @NotNull
    private List<String> environments;

    private List<String> repositories;

    private List<RepositoryProfileDto> repoProfiles;
}