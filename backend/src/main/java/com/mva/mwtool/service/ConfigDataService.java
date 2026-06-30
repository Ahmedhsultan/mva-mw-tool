package com.mva.mwtool.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.ConfigEnvironmentsDto;
import com.mva.mwtool.dto.ConfigEnvironmentsRequest;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class ConfigDataService {

    private static final String PROVIDER = "azure";
    private static final String ENVIRONMENTS_FILE_PATH = "db/config/environments.json";
    private static final String ENVIRONMENTS_COMMIT_MESSAGE = "Update configuration environments";

    private final DevOpsServiceFactory factory;
    private final ObjectMapper objectMapper;

    public ConfigDataService(DevOpsServiceFactory factory, ObjectMapper objectMapper) {
        this.factory = factory;
        this.objectMapper = objectMapper;
    }

    public ConfigEnvironmentsDto getEnvironments(String pat, String organization, String project,
                                                 String repoId, String branch) {
        RepoFileDto file = factory.getRepoService(PROVIDER)
                .pullFile(pat, organization, project, repoId, ENVIRONMENTS_FILE_PATH, branch);
        return parseEnvironments(file.getContent());
    }

    public void saveEnvironments(String pat, String organization, String project,
                                 ConfigEnvironmentsRequest request) {
        ConfigEnvironmentsDto payload = new ConfigEnvironmentsDto(
                normalizeEnvironments(request.getEnvironments())
        );

        factory.getRepoService(PROVIDER).pushFile(
                pat,
                organization,
                project,
                request.getRepoId(),
                ENVIRONMENTS_FILE_PATH,
                request.getBranch(),
                serializeEnvironments(payload),
                ENVIRONMENTS_COMMIT_MESSAGE
        );
    }

    private ConfigEnvironmentsDto parseEnvironments(String content) {
        try {
            JsonNode parsed = objectMapper.readTree(content);
            if (parsed.isArray()) {
                return new ConfigEnvironmentsDto(readStringArray(parsed));
            }

            JsonNode environments = parsed.path("environments");
            if (environments.isArray()) {
                return new ConfigEnvironmentsDto(readStringArray(environments));
            }

            throw new IllegalArgumentException("Invalid environments file format");
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Invalid environments file format", exception);
        }
    }

    private String serializeEnvironments(ConfigEnvironmentsDto payload) {
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload)
                    + System.lineSeparator();
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize environments", exception);
        }
    }

    private List<String> readStringArray(JsonNode node) {
        List<String> values = new ArrayList<>();
        node.forEach(item -> values.add(item.asText("")));
        return normalizeEnvironments(values);
    }

    private List<String> normalizeEnvironments(List<String> environments) {
        Set<String> normalized = new LinkedHashSet<>();

        if (environments != null) {
            environments.stream()
                    .map(environment -> environment == null ? "" : environment.trim().toLowerCase())
                    .filter(environment -> !environment.isBlank())
                    .forEach(normalized::add);
        }

        return new ArrayList<>(normalized);
    }
}