package com.mva.mwtool.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class PipelineRunRequest {
    private Map<String, ConnectorCredentials> connectors;
    private Map<String, String> variables;

    public DevOpsCredentials toDevOpsCredentials() {
        return new DevOpsCredentials(connectors);
    }
}