package com.mva.mwtool.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class ConnectorDto {

    private String id;
    private String name;
    private String provider;
    private String pat;
    private String organization;
    private String project;
}
