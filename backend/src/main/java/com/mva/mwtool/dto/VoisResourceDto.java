package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class VoisResourceDto {

    private String id;

    @NotBlank
    private String label;

    private String description;
    private String url;

    @NotBlank
    @Pattern(regexp = "link|file", message = "type must be link or file")
    private String type;

    @NotBlank
    private String category;

    private Boolean isCustom;
}