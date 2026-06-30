package com.mva.mwtool.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.ConfigDataDto;
import com.mva.mwtool.dto.ConfigDataRequest;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class ConfigDataService {

    private static final String PROVIDER = "azure";
    private static final String CONFIG_FILE_PATH = "db/config/config.json";
    private static final String LEGACY_CONFIG_FILE_PATH = "db/config/environments.json";
    private static final String CONFIG_COMMIT_MESSAGE = "Update configuration data";
    private static final Path LOCAL_CONFIG_FILE_PATH = Paths.get("..", "db", "config", "config.json");
    private static final Path LOCAL_LEGACY_CONFIG_FILE_PATH = Paths.get("..", "db", "config", "environments.json");

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

        if (request.getRepoId() != null && !request.getRepoId().isBlank()) {
            factory.getRepoService(PROVIDER).pushFile(
                pat,
                organization,
                project,
                request.getRepoId(),
                CONFIG_FILE_PATH,
                resolveBranch(request.getBranch()),
                serializeConfigData(payload),
                CONFIG_COMMIT_MESSAGE
            );
            return;
        }

        writeLocalConfigFile(payload);
    }

    private RepoFileDto pullConfigFile(String pat, String organization, String project,
                                       String repoId, String branch) {
        if (repoId != null && !repoId.isBlank()) {
            try {
                return factory.getRepoService(PROVIDER)
                        .pullFile(pat, organization, project, repoId, CONFIG_FILE_PATH, resolveBranch(branch));
            } catch (Exception ignored) {
                try {
                    return factory.getRepoService(PROVIDER)
                            .pullFile(pat, organization, project, repoId, LEGACY_CONFIG_FILE_PATH, resolveBranch(branch));
                } catch (Exception ignoredAgain) {
                    // Fall through to local dev config below.
                }
            }
        }

        return new RepoFileDto(CONFIG_FILE_PATH, readLocalConfigFile(), "local");
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

    private String resolveBranch(String branch) {
        return branch == null || branch.isBlank() ? "main" : branch;
    }

    private String readLocalConfigFile() {
        try {
            if (Files.exists(LOCAL_CONFIG_FILE_PATH)) {
                return Files.readString(LOCAL_CONFIG_FILE_PATH);
            }

            if (Files.exists(LOCAL_LEGACY_CONFIG_FILE_PATH)) {
                return Files.readString(LOCAL_LEGACY_CONFIG_FILE_PATH);
            }
        } catch (IOException exception) {
            throw new IllegalStateException("Could not read local config file", exception);
        }

        throw new IllegalStateException("Could not locate local config file");
    }

    private void writeLocalConfigFile(ConfigDataDto payload) {
        try {
            Path parent = LOCAL_CONFIG_FILE_PATH.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }

            Files.writeString(LOCAL_CONFIG_FILE_PATH, serializeConfigData(payload));
        } catch (IOException exception) {
            throw new IllegalStateException("Could not write local config file", exception);
        }
    }
}