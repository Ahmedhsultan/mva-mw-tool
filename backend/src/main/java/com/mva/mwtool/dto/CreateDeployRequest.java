package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class CreateDeployRequest {

    @NotBlank
    private String buildId;

    @NotBlank
    private String definitionId;

    @NotBlank
    private String environment;

    private String description;
}
