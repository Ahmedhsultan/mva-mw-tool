package com.mvax.mwtools.dto;

public record BuildStatusResult(boolean done, boolean success, String status, String result) {
}
