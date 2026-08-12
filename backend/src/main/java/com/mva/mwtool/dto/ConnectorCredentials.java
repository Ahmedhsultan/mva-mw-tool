package com.mva.mwtool.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class ConnectorCredentials {
    private String type;
    private String pat;
    private String organization;
    private String project;
}
