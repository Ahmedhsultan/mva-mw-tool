package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class CreateBuildRequest {

    @NotBlank
    private String branch;

    @NotBlank
    private String repoId;

    @NotBlank
    private String definitionId;
}
