package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.PushFileRequest;
import com.mva.mwtool.dto.RepoFileDto;
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
        RepoFileDto file = factory.getRepoService(provider)
                .pullFile(pat, organization, project, repoId, filePath, branch);
        return ResponseEntity.ok(file);
    }

    @PostMapping("/file")
    public ResponseEntity<Void> pushFile(
            @RequestHeader("X-PAT") String pat,
            @RequestParam String provider,
            @RequestParam String organization,
            @RequestParam String project,
            @Valid @RequestBody PushFileRequest request) {
        factory.getRepoService(provider)
                .pushFile(pat, organization, project,
                        request.getRepoId(), request.getFilePath(), request.getBranch(),
                        request.getContent(), request.getCommitMessage());
        return ResponseEntity.ok().build();
    }
}
