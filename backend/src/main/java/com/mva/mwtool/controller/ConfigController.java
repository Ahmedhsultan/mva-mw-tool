package com.mva.mwtool.controller;

import com.mva.mwtool.dto.ConfigEnvironmentsDto;
import com.mva.mwtool.dto.ConfigEnvironmentsRequest;
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

    @GetMapping("/environments")
    public ResponseEntity<ConfigEnvironmentsDto> getEnvironments(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String organization,
            @RequestParam String project,
            @RequestParam String repoId,
            @RequestParam String branch) {
        ConfigEnvironmentsDto response = configDataService.getEnvironments(
                pat, organization, project, repoId, branch);
        return ResponseEntity.ok(response);
    }

    @PutMapping("/environments")
    public ResponseEntity<Void> saveEnvironments(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody ConfigEnvironmentsRequest request) {
        configDataService.saveEnvironments(pat, organization, project, request);
        return ResponseEntity.ok().build();
    }
}