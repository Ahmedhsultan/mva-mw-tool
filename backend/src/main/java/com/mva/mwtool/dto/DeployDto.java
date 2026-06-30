package com.mva.mwtool.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
public class DeployDto {

    private String id;
    private String name;
    private String status;
    private String environment;
    private List<String> artifacts;
}
