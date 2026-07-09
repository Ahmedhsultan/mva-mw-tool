package com.mvax.mwtools.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DataRequest;
import com.mvax.mwtools.dto.IterationResult;
import com.mvax.mwtools.dto.PatConfig;
import com.mvax.mwtools.pipeline.cutoff.CutoffServiceInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class SettingsService {

    private static final String FILE_PATH = "db/settings.json";
    private static final String TOOL_DB_REPO = "MVAX-MW-Tools";
    private static final String TOOL_DB_BRANCH = "main";
    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);

    private final JsonDbService dbService;
    private final AzureDevOpsService azureService;
    private final ObjectMapper mapper;

    public SettingsService(JsonDbService dbService, AzureDevOpsService azureService, ObjectMapper mapper) {
        this.dbService = dbService;
        this.azureService = azureService;
        this.mapper = mapper;
    }

    /**
     * Read the tool's canonical settings.json from the Git JSON DB.
     * This is used by backend pipelines to match frontend behavior.
     */
    public JsonNode readToolSettings(PatConfig pat) {
        return dbService.readFile(pat, TOOL_DB_REPO, TOOL_DB_BRANCH, FILE_PATH);
    }

    public List<String> getAllEnvironments(PatConfig pat) {
        return readStringArray(readToolSettings(pat), "environments");
    }

    public List<String> getDeployEnvironments(PatConfig pat) {
        return readStringArray(readToolSettings(pat), "envs_deploy");
    }

    public List<String> getReservationEnvironments(PatConfig pat) {
        return readStringArray(readToolSettings(pat), "envs_reservation");
    }

    public List<String> getCutoffEnvironments(PatConfig pat) {
        return readStringArray(readToolSettings(pat), "envs_cutoff");
    }

    /**
     * All repos listed in serviceConfigs (includes libraries).
     */
    public List<String> getServiceNames(PatConfig pat) {
        JsonNode root = readToolSettings(pat);
        JsonNode configs = root != null ? root.get("serviceConfigs") : null;
        if (configs == null || !configs.isArray()) return List.of();

        List<String> services = new ArrayList<>();
        for (JsonNode c : configs) {
            String name = c.path("name").asText("");
            if (!name.isBlank()) services.add(name);
        }
        return List.copyOf(services);
    }

    /**
     * Non-library repos (type == "service").
     */
    public List<String> getDeployableServiceNames(PatConfig pat) {
        JsonNode root = readToolSettings(pat);
        JsonNode configs = root != null ? root.get("serviceConfigs") : null;
        if (configs == null || !configs.isArray()) return List.of();

        List<String> services = new ArrayList<>();
        for (JsonNode c : configs) {
            String name = c.path("name").asText("");
            if (name.isBlank()) continue;
            String type = c.path("type").asText("service");
            if (!"library".equalsIgnoreCase(type)) services.add(name);
        }
        return List.copyOf(services);
    }

    /**
     * Cutoff-oriented service info (branchPrefix, dropDbBranch, library/service).
     */
    public Map<String, CutoffServiceInfo> loadServiceInfos(PatConfig pat) {
        try {
            JsonNode root = readToolSettings(pat);
            if (root == null) return Map.of();
            JsonNode configs = root.get("serviceConfigs");
            if (configs == null || !configs.isArray()) return Map.of();

            Map<String, CutoffServiceInfo> map = new HashMap<>();
            for (JsonNode c : configs) {
                String name = c.path("name").asText("");
                if (name.isBlank()) continue;
                String type = c.path("type").asText("service");
                String branchPrefix = c.path("branchPrefix").asText("release/primary");
                String dropDbBranch = c.has("dropDbBranch") ? c.path("dropDbBranch").asText(null) : null;
                map.put(name, new CutoffServiceInfo(name, type, branchPrefix, dropDbBranch));
            }
            return map;
        } catch (Exception e) {
            log.warn("Failed to load serviceConfigs from settings.json: {}", e.getMessage());
            return Map.of();
        }
    }

    private List<String> readStringArray(JsonNode root, String key) {
        if (root == null || key == null || key.isBlank()) return List.of();
        JsonNode arr = root.get(key);
        if (arr == null || !arr.isArray()) return List.of();

        List<String> out = new ArrayList<>();
        for (JsonNode n : arr) {
            if (n == null || !n.isTextual()) continue;
            String v = n.asText("");
            if (!v.isBlank()) out.add(v.trim());
        }
        return List.copyOf(out);
    }

    public JsonNode read(DataRequest req) {
        return dbService.readFile(req.patConfig(), req.repo(), req.branch(), FILE_PATH);
    }

    public ApiResult write(DataRequest req) {
        return dbService.writeFile(req.patConfig(), req.repo(), req.branch(), FILE_PATH, req.data(), req.comment());
    }

    public ApiResult validatePat(PatConfig pat) {
        return azureService.validatePat(pat);
    }

    public List<IterationResult> iterations(PatConfig pat, String team) {
        return azureService.getAllIterations(pat, team);
    }

    public Map<String, Object> localForcePull() {
        try {
            File file = new File(FILE_PATH);
            if (!file.exists()) {
                return Map.of("forcePull", Map.of());
            }
            JsonNode root = mapper.readTree(file);
            JsonNode fp = root.get("forcePull");
            if (fp == null || fp.isNull() || fp.isMissingNode()) {
                return Map.of("forcePull", Map.of());
            }
            return Map.of("forcePull", mapper.convertValue(fp, Map.class));
        } catch (Exception e) {
            log.warn("Failed to read local settings: {}", e.getMessage());
            return Map.of("forcePull", Map.of());
        }
    }
}
