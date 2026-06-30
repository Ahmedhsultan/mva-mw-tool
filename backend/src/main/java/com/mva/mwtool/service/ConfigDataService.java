package com.mva.mwtool.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.ConfigDataDto;
import com.mva.mwtool.dto.ConfigDataRequest;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class ConfigDataService {

    private static final String PROVIDER = "azure";
    private static final String CONFIG_FILE_PATH = "db/config/config.json";
    private static final String LEGACY_CONFIG_FILE_PATH = "db/config/environments.json";
    private static final String CONFIG_COMMIT_MESSAGE = "Update configuration data";

    private final DevOpsServiceFactory factory;
    private final ObjectMapper objectMapper;

    public ConfigDataService(DevOpsServiceFactory factory, ObjectMapper objectMapper) {
        this.factory = factory;
        this.objectMapper = objectMapper;
    }

    public ConfigDataDto getConfigData(String pat, String organization, String project,
                                       String repoId, String branch) {
        RepoFileDto file = pullConfigFile(pat, organization, project, repoId, branch);
        return parseConfigData(file.getContent());
    }

    public void saveConfigData(String pat, String organization, String project,
                               ConfigDataRequest request) {
        ConfigDataDto payload = new ConfigDataDto(
                normalizeEnvironments(request.getEnvironments()),
                normalizeRepositories(request.getRepositories())
        );

        factory.getRepoService(PROVIDER).pushFile(
                pat,
                organization,
                project,
                request.getRepoId(),
                CONFIG_FILE_PATH,
                request.getBranch(),
                serializeConfigData(payload),
                CONFIG_COMMIT_MESSAGE
        );
    }

    private RepoFileDto pullConfigFile(String pat, String organization, String project,
                                       String repoId, String branch) {
        try {
            return factory.getRepoService(PROVIDER)
                    .pullFile(pat, organization, project, repoId, CONFIG_FILE_PATH, branch);
        } catch (Exception ignored) {
            return factory.getRepoService(PROVIDER)
                    .pullFile(pat, organization, project, repoId, LEGACY_CONFIG_FILE_PATH, branch);
        }
    }

    private ConfigDataDto parseConfigData(String content) {
        try {
            JsonNode parsed = objectMapper.readTree(content);
            if (parsed.isArray()) {
                return new ConfigDataDto(readStringArray(parsed, true), List.of());
            }

            JsonNode environments = parsed.path("environments");
            JsonNode repositories = parsed.path("repositories");

            return new ConfigDataDto(
                    environments.isArray() ? readStringArray(environments, true) : List.of(),
                    repositories.isArray() ? readStringArray(repositories, false) : List.of()
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Invalid config file format", exception);
        }
    }

    private String serializeConfigData(ConfigDataDto payload) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload)
                    + System.lineSeparator();
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize config data", exception);
        }
    }

    private List<String> readStringArray(JsonNode node, boolean lowercase) {
        List<String> values = new ArrayList<>();
        node.forEach(item -> values.add(item.asText("")));
        return normalizeNames(values, lowercase);
    }

    private List<String> normalizeEnvironments(List<String> environments) {
        return normalizeNames(environments, true);
    }

    private List<String> normalizeRepositories(List<String> repositories) {
        return normalizeNames(repositories, false);
    }

    private List<String> normalizeNames(List<String> values, boolean lowercase) {
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
}