package com.mva.mwtool.dto;

import jakarta.validation.constraints.NotBlank;

public class AuthRequest {

    @NotBlank
    private String pat;

    @NotBlank
    private String provider; // "azure" or "github"

    private String organization;
    private String project;

    public AuthRequest() {}

    public AuthRequest(String pat, String provider, String organization, String project) {
        this.pat = pat;
        this.provider = provider;
        this.organization = organization;
        this.project = project;
    }

    public String getPat() { return pat; }
    public void setPat(String pat) { this.pat = pat; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getOrganization() { return organization; }
    public void setOrganization(String organization) { this.organization = organization; }
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
}
