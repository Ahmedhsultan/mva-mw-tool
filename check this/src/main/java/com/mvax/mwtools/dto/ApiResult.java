package com.mvax.mwtools.dto;

public record ApiResult(boolean success, String message) {
    public static ApiResult ok(String message) {
        return new ApiResult(true, message);
    }

    public static ApiResult fail(String message) {
        return new ApiResult(false, message);
    }
}
