package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/builds")
public class BuildController {

    private final DevOpsServiceFactory factory;

    public BuildController(DevOpsServiceFactory factory) {
        this.factory = factory;
    }

    @GetMapping("/{buildId}")
    public ResponseEntity<BuildDto> getBuildById(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @PathVariable String buildId) {
        DevOpsContext context = createContext(provider, pat, organization, project);
        BuildDto build = context.getBuildService().getBuildById(buildId);
        return ResponseEntity.ok(build);
    }

    @GetMapping
    public ResponseEntity<List<BuildDto>> getBuildsByBranchAndRepo(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @RequestParam String branch,
            @RequestParam String repoId) {
        DevOpsContext context = createContext(provider, pat, organization, project);
        List<BuildDto> builds = context.getBuildService().getBuildsByBranchAndRepo(branch, repoId);
        return ResponseEntity.ok(builds);
    }

    @PostMapping
    public ResponseEntity<BuildDto> createBuild(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody CreateBuildRequest request) {
        DevOpsContext context = createContext(provider, pat, organization, project);
        BuildDto build = context.getBuildService()
                .createBuild(request.getBranch(), request.getRepoId(), request.getDefinitionId());
        return ResponseEntity.ok(build);
    }

    private DevOpsContext createContext(String provider, String pat, String organization, String project) {
        DevOpsCredentials credentials = new DevOpsCredentials();
        credentials.setConnectors(java.util.Map.of(provider.toLowerCase(),
                new ConnectorCredentials(provider.toLowerCase(), pat, organization, project)));
        return factory.create(provider, credentials);
    }
}
