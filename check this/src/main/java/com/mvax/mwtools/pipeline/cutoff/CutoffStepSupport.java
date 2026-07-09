package com.mvax.mwtools.pipeline.cutoff;

import java.util.Map;

public final class CutoffStepSupport {

    private CutoffStepSupport() {
    }

    public static String releaseBranch(String serviceName, String releaseNumber, Map<String, CutoffServiceInfo> infos) {
        String prefix = null;
        if (infos != null) {
            CutoffServiceInfo info = infos.get(serviceName);
            if (info != null) prefix = info.branchPrefix();
        }
        if (prefix == null || prefix.isBlank()) {
            prefix = "release/primary";
        }
        String p = prefix.endsWith("/") ? prefix.substring(0, prefix.length() - 1) : prefix;
        return p + "/" + releaseNumber;
    }

    public static boolean isLibrary(String serviceName, Map<String, CutoffServiceInfo> infos) {
        if (infos == null) return false;
        CutoffServiceInfo info = infos.get(serviceName);
        if (info == null) return false;
        return "library".equalsIgnoreCase(info.type());
    }

    public static String dropDbBranch(String serviceName, Map<String, CutoffServiceInfo> infos) {
        if (infos == null) return null;
        CutoffServiceInfo info = infos.get(serviceName);
        return info != null ? info.dropDbBranch() : null;
    }

    public static String buildLabel(String serviceName, String variant) {
        return serviceName + " (" + variant + ")";
    }

    public static String buildKey(String serviceName, String variant) {
        return serviceName + ":" + variant;
    }
}
