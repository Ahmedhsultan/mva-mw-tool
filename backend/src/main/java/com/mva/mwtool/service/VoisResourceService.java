package com.mva.mwtool.service;

import com.mva.mwtool.dto.VoisResourceDto;
import com.mva.mwtool.repository.VoisResourceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class VoisResourceService {

    private final VoisResourceRepository repository;

    public VoisResourceService(VoisResourceRepository repository) {
        this.repository = repository;
    }

    public List<VoisResourceDto> listResources(String pat, String provider, String organization, String project,
                                               String repoId, String branch) {
        return repository.listResources(pat, provider, organization, project, repoId, branch);
    }

    public VoisResourceDto createResource(String pat, String provider, String organization, String project,
                                          String repoId, String branch, VoisResourceDto request) {
        VoisResourceDto normalizedRequest = normalize(request);

        if (!hasText(normalizedRequest.getLabel())) {
            throw badRequest("Resource label is required");
        }

        if (!hasText(normalizedRequest.getCategory())) {
            throw badRequest("Resource category is required");
        }

        if (!"link".equals(normalizedRequest.getType()) && !"file".equals(normalizedRequest.getType())) {
            throw badRequest("Resource type must be link or file");
        }

        return repository.saveCustomResource(pat, provider, organization, project, repoId, branch, normalizedRequest);
    }

    public void deleteResource(String pat, String provider, String organization, String project,
                               String repoId, String branch, String id) {
        if (!hasText(id)) {
            throw badRequest("Resource id is required");
        }

        VoisResourceDto resource = repository.findResource(pat, provider, organization, project, repoId, branch, id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Resource not found"));

        if (!Boolean.TRUE.equals(resource.getIsCustom())) {
            throw badRequest("Only custom resources can be deleted");
        }

        boolean deleted = repository.deleteCustomResource(pat, provider, organization, project, repoId, branch, id);
        if (!deleted) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Custom resource not found");
        }
    }

    private VoisResourceDto normalize(VoisResourceDto request) {
        return new VoisResourceDto(
            trimToNull(request.getId()),
            trimToNull(request.getLabel()),
            trimToNull(request.getDescription()),
            trimToNull(request.getUrl()),
            trimToNull(request.getType()),
            trimToNull(request.getCategory()),
            true
        );
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}