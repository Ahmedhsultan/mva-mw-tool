package com.mva.mwtool.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class BuildDto {

    private String id;
    private String buildNumber;
    private String status;
    private String result;
    private String sourceBranch;
    private String definitionName;
    private String definitionId;
    private String url;
}
