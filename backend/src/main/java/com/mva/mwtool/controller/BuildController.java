package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.BuildDto;
import com.mva.mwtool.dto.CreateBuildRequest;
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
        BuildDto build = factory.getBuildService(provider)
                .getBuildById(pat, organization, project, buildId);
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
        List<BuildDto> builds = factory.getBuildService(provider)
                .getBuildsByBranchAndRepo(pat, organization, project, branch, repoId);
        return ResponseEntity.ok(builds);
    }

    @PostMapping
    public ResponseEntity<BuildDto> createBuild(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody CreateBuildRequest request) {
        BuildDto build = factory.getBuildService(provider)
                .createBuild(pat, organization, project,
                        request.getBranch(), request.getRepoId(), request.getDefinitionId());
        return ResponseEntity.ok(build);
    }
}
