package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class PushFileRequest {

    @NotBlank
    private String repoId;

    @NotBlank
    private String filePath;

    @NotBlank
    private String branch;

    @NotBlank
    private String content;

    @NotBlank
    private String commitMessage;
}
