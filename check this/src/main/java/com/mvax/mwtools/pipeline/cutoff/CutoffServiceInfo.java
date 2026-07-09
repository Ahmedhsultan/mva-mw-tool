package com.mvax.mwtools.pipeline.cutoff;

/** Minimal per-service config needed by the cutoff pipeline. */
public record CutoffServiceInfo(
        String name,
        String type,          // "service" | "library"
        String branchPrefix,  // e.g. "release/primary" or "primary"
        String dropDbBranch   // nullable
) {
}
