package com.mva.mwtool.dto;

public class AuthResponse {

    private boolean valid;
    private String displayName;
    private String email;

    public AuthResponse() {}

    public AuthResponse(boolean valid, String displayName, String email) {
        this.valid = valid;
        this.displayName = displayName;
        this.email = email;
    }

    public boolean isValid() { return valid; }
    public void setValid(boolean valid) { this.valid = valid; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}
