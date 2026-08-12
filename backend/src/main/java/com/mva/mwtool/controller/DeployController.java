package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.*;
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
            @PathVariable String deployId,
            @RequestParam(required = false) String environment) {
        DevOpsContext context = createContext(provider, pat, organization, project);
        DeployDto deploy = context.getDeployService().getDeployById(deployId, environment);
        return ResponseEntity.ok(deploy);
    }

    @PostMapping
    public ResponseEntity<DeployDto> createDeploy(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody CreateDeployRequest request) {
        DevOpsContext context = createContext(provider, pat, organization, project);
        DeployDto deploy = context.getDeployService()
                .createDeploy(request.getBuildId(), request.getDefinitionId(),
                        request.getEnvironment(), request.getDescription());
        return ResponseEntity.ok(deploy);
    }

    private DevOpsContext createContext(String provider, String pat, String organization, String project) {
        DevOpsCredentials credentials = new DevOpsCredentials();
        credentials.setConnectors(java.util.Map.of(provider.toLowerCase(),
                new ConnectorCredentials(provider.toLowerCase(), pat, organization, project)));
        return factory.create(provider, credentials);
    }
}
