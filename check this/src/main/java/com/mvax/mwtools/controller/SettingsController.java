package com.mvax.mwtools.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DataRequest;
import com.mvax.mwtools.dto.IterationResult;
import com.mvax.mwtools.dto.PatConfig;
import com.mvax.mwtools.service.SettingsService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {

    private final SettingsService settingsService;

    public SettingsController(SettingsService settingsService) {
        this.settingsService = settingsService;
    }

    @PostMapping("/read")
    public JsonNode read(@RequestBody DataRequest req) {
        return settingsService.read(req);
    }

    @PostMapping("/write")
    public ApiResult write(@RequestBody DataRequest req) {
        return settingsService.write(req);
    }

    @PostMapping("/validate-pat")
    public ApiResult validatePat(@RequestBody PatConfig pat) {
        return settingsService.validatePat(pat);
    }

    @PostMapping("/iterations")
    public List<IterationResult> iterations(@RequestBody PatConfig pat,
                                            @RequestParam(defaultValue = "MVA-Nubia") String team) {
        return settingsService.iterations(pat, team);
    }

    /**
     * Read the local db/settings.json from the filesystem and return its forcePull field.
     * Used to compare against the remote flag — if they match, the user has pulled.
     */
    @GetMapping("/local-force-pull")
    public Map<String, Object> localForcePull() {
        return settingsService.localForcePull();
    }
}
