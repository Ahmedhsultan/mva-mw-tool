package com.mva.mwtool.dto;

import java.util.List;

public class ConfigEnvironmentsDto {

    private List<String> environments;

    public ConfigEnvironmentsDto() {}

    public ConfigEnvironmentsDto(List<String> environments) {
        this.environments = environments;
    }

    public List<String> getEnvironments() { return environments; }
    public void setEnvironments(List<String> environments) { this.environments = environments; }
}