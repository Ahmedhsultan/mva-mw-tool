package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.*;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/repo")
public class RepoController {

    private final DevOpsServiceFactory factory;

    public RepoController(DevOpsServiceFactory factory) {
        this.factory = factory;
    }

    @GetMapping("/file")
    public ResponseEntity<RepoFileDto> pullFile(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @RequestParam String repoId,
            @RequestParam String filePath,
            @RequestParam String branch) {
        DevOpsContext context = createContext(provider, pat, organization, project);
        RepoFileDto file = context.getRepoService().pullFile(repoId, filePath, branch);
        return ResponseEntity.ok(file);
    }

    @PostMapping("/file")
    public ResponseEntity<Void> pushFile(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody PushFileRequest request) {
        DevOpsContext context = createContext(provider, pat, organization, project);
        context.getRepoService().pushFile(
                request.getRepoId(), request.getFilePath(), request.getBranch(),
                request.getContent(), request.getCommitMessage());
        return ResponseEntity.ok().build();
    }

    private DevOpsContext createContext(String provider, String pat, String organization, String project) {
        DevOpsCredentials credentials = new DevOpsCredentials();
        credentials.setConnectors(java.util.Map.of(provider.toLowerCase(),
                new ConnectorCredentials(provider.toLowerCase(), pat, organization, project)));
        return factory.create(provider, credentials);
    }
}
