package com.mva.mwtool.controller;

import com.mva.mwtool.dto.ConfigDataDto;
import com.mva.mwtool.dto.ConfigDataRequest;
import com.mva.mwtool.service.ConfigDataService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    private final ConfigDataService configDataService;

    public ConfigController(ConfigDataService configDataService) {
        this.configDataService = configDataService;
    }

        @GetMapping
        public ResponseEntity<ConfigDataDto> getConfig(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
                @RequestParam(required = false) String repoId,
                @RequestParam(required = false) String branch) {
        ConfigDataDto response = configDataService.getConfigData(
                pat, provider, organization, project, repoId, branch);
        return ResponseEntity.ok(response);
    }

        @PutMapping
        public ResponseEntity<Void> saveConfig(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody ConfigDataRequest request) {
        configDataService.saveConfigData(pat, provider, organization, project, request);
        return ResponseEntity.ok().build();
    }
}