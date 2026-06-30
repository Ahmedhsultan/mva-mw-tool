package com.mva.mwtool.service;

import com.mva.mwtool.dto.ConfigDataDto;
import com.mva.mwtool.dto.ConfigDataRequest;
import com.mva.mwtool.entity.ConfigEntity;
import com.mva.mwtool.repository.ConfigRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class ConfigDataService {

    private final ConfigRepository configRepository;

    public ConfigDataService(ConfigRepository configRepository) {
        this.configRepository = configRepository;
    }

    public ConfigDataDto getConfigData(String pat, String provider, String organization, String project,
                                       String repoId, String branch) {
        ConfigEntity configEntity = configRepository.readConfig(
            pat,
            provider,
            organization,
            project,
            repoId,
            resolveBranch(branch)
        );

        return new ConfigDataDto(
            normalize(configEntity.getEnvironments(), true),
            normalize(configEntity.getRepositories(), false)
        );
    }

    public void saveConfigData(String pat, String provider, String organization, String project,
                               ConfigDataRequest request) {
        String resolvedRepoId = request.getRepoId();
        String resolvedBranch = resolveBranch(request.getBranch());
        ConfigEntity payload = new ConfigEntity(
            normalize(request.getEnvironments(), true),
            normalize(request.getRepositories(), false)
        );

        configRepository.updateConfig(
            pat,
            provider,
            organization,
            project,
            resolvedRepoId,
            resolvedBranch,
            payload
        );
    }

    private List<String> normalize(List<String> values, boolean lowercase) {
        Set<String> normalized = new LinkedHashSet<>();

        if (values != null) {
            values.stream()
                    .map(value -> normalizeValue(value, lowercase))
                    .filter(value -> !value.isBlank())
                    .forEach(normalized::add);
        }

        return new ArrayList<>(normalized);
    }

    private String normalizeValue(String value, boolean lowercase) {
        String normalized = value == null ? "" : value.trim();
        return lowercase ? normalized.toLowerCase() : normalized;
    }

    private String resolveBranch(String branch) {
        return branch == null || branch.isBlank() ? "main" : branch;
    }
}