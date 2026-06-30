package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.CreateDeployRequest;
import com.mva.mwtool.dto.DeployDto;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/deploys")
public class DeployController {

    private final DevOpsServiceFactory factory;

    public DeployController(DevOpsServiceFactory factory) {
        this.factory = factory;
    }

    @GetMapping("/{deployId}")
    public ResponseEntity<DeployDto> getDeployById(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @PathVariable String deployId) {
        DeployDto deploy = factory.getDeployService(provider)
                .getDeployById(pat, organization, project, deployId);
        return ResponseEntity.ok(deploy);
    }

    @PostMapping
    public ResponseEntity<DeployDto> createDeploy(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody CreateDeployRequest request) {
        DeployDto deploy = factory.getDeployService(provider)
                .createDeploy(pat, organization, project,
                        request.getBuildId(), request.getDefinitionId(),
                        request.getEnvironment(), request.getDescription());
        return ResponseEntity.ok(deploy);
    }
}
