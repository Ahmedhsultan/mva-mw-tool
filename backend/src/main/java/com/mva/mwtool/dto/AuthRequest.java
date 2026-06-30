package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AuthRequest {

    @NotBlank
    private String pat;

    @NotBlank
    private String provider; // "azure" or "github"

    private String organization;
    private String project;
}
