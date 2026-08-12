package com.mva.mwtool.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class DevOpsCredentials {
    private Map<String, ConnectorCredentials> connectors;

    public String getPat(String provider) {
        ConnectorCredentials c = connectors != null ? connectors.get(provider) : null;
        return c != null ? c.getPat() : null;
    }

    public String getOrganization(String provider) {
        ConnectorCredentials c = connectors != null ? connectors.get(provider) : null;
        return c != null ? c.getOrganization() : null;
    }

    public String getProject(String provider) {
        ConnectorCredentials c = connectors != null ? connectors.get(provider) : null;
        return c != null ? c.getProject() : null;
    }
}

