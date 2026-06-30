package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
public class ConfigDataRequest {

    @NotBlank
    private String repoId;

    @NotBlank
    private String branch;

    @NotNull
    private List<String> environments;

    private List<String> repositories;
}