package com.mvax.mwtools.dto;

public record TokenResponse(boolean success, String token, String message) {
    public static TokenResponse ok(String token) {
        return new TokenResponse(true, token, null);
    }

    public static TokenResponse fail(String message) {
        return new TokenResponse(false, null, message);
    }
}
