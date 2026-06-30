package com.mva.mwtool.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RepoFileDto {

    private String path;
    private String content;
    private String commitId;
}
