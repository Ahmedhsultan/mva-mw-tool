package com.mva.mwtool.controller;

import com.mva.mwtool.dto.VoisResourceDto;
import com.mva.mwtool.service.VoisResourceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/resources")
public class VoisResourceController {

    private final VoisResourceService voisResourceService;

    public VoisResourceController(VoisResourceService voisResourceService) {
        this.voisResourceService = voisResourceService;
    }

    @GetMapping
    public ResponseEntity<List<VoisResourceDto>> listResources(
        @RequestHeader("X-PAT") String pat,
        @RequestParam String provider,
        @RequestParam String organization,
        @RequestParam String project,
        @RequestParam String repoId,
        @RequestParam(required = false) String branch
    ) {
        return ResponseEntity.ok(voisResourceService.listResources(pat, provider, organization, project, repoId, branch));
    }

    @PostMapping
    public ResponseEntity<VoisResourceDto> createResource(
        @RequestHeader("X-PAT") String pat,
        @RequestParam String provider,
        @RequestParam String organization,
        @RequestParam String project,
        @RequestParam String repoId,
        @RequestParam(required = false) String branch,
        @Valid @RequestBody VoisResourceDto request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(voisResourceService.createResource(pat, provider, organization, project, repoId, branch, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteResource(
        @RequestHeader("X-PAT") String pat,
        @RequestParam String provider,
        @RequestParam String organization,
        @RequestParam String project,
        @RequestParam String repoId,
        @RequestParam(required = false) String branch,
        @PathVariable String id
    ) {
        voisResourceService.deleteResource(pat, provider, organization, project, repoId, branch, id);
        return ResponseEntity.noContent().build();
    }
}