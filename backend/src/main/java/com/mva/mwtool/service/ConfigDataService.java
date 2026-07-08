package com.mva.mwtool.service;

import com.mva.mwtool.dto.ConfigDataDto;
import com.mva.mwtool.dto.ConfigDataRequest;
import com.mva.mwtool.dto.RepositoryProfileDto;
import com.mva.mwtool.entity.ConfigEntity;
import com.mva.mwtool.repository.ConfigRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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

        List<RepositoryProfileDto> repoProfiles = normalizeRepoProfiles(
            configEntity.getRepoProfiles(),
            configEntity.getRepositories()
        );

        return new ConfigDataDto(
            normalize(configEntity.getEnvironments(), true),
            deriveRepositories(repoProfiles, configEntity.getRepositories()),
            repoProfiles
        );
    }

    public void saveConfigData(String pat, String provider, String organization, String project,
                               ConfigDataRequest request) {
        String resolvedRepoId = request.getRepoId();
        String resolvedBranch = resolveBranch(request.getBranch());
        List<RepositoryProfileDto> repoProfiles = normalizeRepoProfiles(
            request.getRepoProfiles(),
            request.getRepositories()
        );
        ConfigEntity payload = new ConfigEntity(
            normalize(request.getEnvironments(), true),
            deriveRepositories(repoProfiles, request.getRepositories()),
            repoProfiles
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

    private List<RepositoryProfileDto> normalizeRepoProfiles(List<RepositoryProfileDto> repoProfiles,
                                                             List<String> repositories) {
        Map<String, RepositoryProfileDto> normalized = new LinkedHashMap<>();

        if (repoProfiles != null) {
            for (RepositoryProfileDto repoProfile : repoProfiles) {
                RepositoryProfileDto normalizedProfile = normalizeRepoProfile(repoProfile);
                String key = profileKey(normalizedProfile);
                if (!key.isBlank()) {
                    normalized.putIfAbsent(key.toLowerCase(), normalizedProfile);
                }
            }
        }

        if (repositories != null) {
            for (String repository : repositories) {
                String normalizedRepository = normalizeValue(repository, false);
                if (normalizedRepository.isBlank()) {
                    continue;
                }

                String key = normalizedRepository.toLowerCase();
                normalized.putIfAbsent(
                    key,
                    new RepositoryProfileDto(
                        normalizedRepository,
                        null,
                        "service",
                        null,
                        "",
                        "",
                        null,
                        null
                    )
                );
            }
        }

        return new ArrayList<>(normalized.values());
    }

    private RepositoryProfileDto normalizeRepoProfile(RepositoryProfileDto repoProfile) {
        if (repoProfile == null) {
            return new RepositoryProfileDto();
        }

        String name = normalizeValue(repoProfile.getName(), false);
        String repoId = normalizeValue(repoProfile.getRepoId(), false);
        String type = normalizeRepoType(repoProfile.getType());

        if (name.isBlank()) {
            name = repoId;
        }

        if (repoId.isBlank()) {
            repoId = name;
        }

        return new RepositoryProfileDto(
            name,
            null,
            type,
            null,
            normalizeValue(repoProfile.getBuildDefinitionId(), false),
            "library".equals(type) ? "" : normalizeValue(repoProfile.getDeploymentDefinitionId(), false),
            null,
            null
        );
    }

    private List<String> deriveRepositories(List<RepositoryProfileDto> repoProfiles, List<String> repositories) {
        Set<String> normalized = new LinkedHashSet<>();

        if (repoProfiles != null) {
            for (RepositoryProfileDto repoProfile : repoProfiles) {
                String repository = normalizeValue(
                    firstNonBlank(repoProfile.getRepoId(), repoProfile.getName()),
                    false
                );

                if (!repository.isBlank()) {
                    normalized.add(repository);
                }
            }
        }

        if (normalized.isEmpty() && repositories != null) {
            repositories.stream()
                .map(repository -> normalizeValue(repository, false))
                .filter(repository -> !repository.isBlank())
                .forEach(normalized::add);
        }

        return new ArrayList<>(normalized);
    }

    private String profileKey(RepositoryProfileDto repoProfile) {
        return normalizeValue(firstNonBlank(repoProfile.getName(), repoProfile.getRepoId()), false);
    }

    private String firstNonBlank(String primary, String fallback) {
        String normalizedPrimary = normalizeValue(primary, false);
        if (!normalizedPrimary.isBlank()) {
            return normalizedPrimary;
        }

        return normalizeValue(fallback, false);
    }

    private String normalizeValue(String value, boolean lowercase) {
        String normalized = value == null ? "" : value.trim();
        return lowercase ? normalized.toLowerCase() : normalized;
    }

    private String normalizeRepoType(String value) {
        return "library".equalsIgnoreCase(normalizeValue(value, true)) ? "library" : "service";
    }

    private String resolveBranch(String branch) {
        return branch == null || branch.isBlank() ? "main" : branch;
    }
}