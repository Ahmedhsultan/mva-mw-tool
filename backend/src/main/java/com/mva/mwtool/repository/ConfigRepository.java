package com.mva.mwtool.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.entity.ConfigEntity;
import org.springframework.stereotype.Repository;

@Repository
public class ConfigRepository {

    private static final String CONFIG_FILE_PATH = "db/config/config.json";
    private static final String CONFIG_COMMIT_MESSAGE = "Update configuration data";

    private final DevOpsServiceFactory factory;
    private final ObjectMapper objectMapper;

    public ConfigRepository(DevOpsServiceFactory factory, ObjectMapper objectMapper) {
        this.factory = factory;
        this.objectMapper = objectMapper;
    }

    public ConfigEntity readConfig(String pat, String provider, String organization, String project,
                                   String repoId, String branch) {
        try {
            String content = factory.getRepoService(provider)
                .pullFile(pat, organization, project, repoId, CONFIG_FILE_PATH, branch)
                .getContent();

            return objectMapper.readValue(content, ConfigEntity.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Invalid config file format", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load config from provider repo", exception);
        }
    }

    public void updateConfig(String pat, String provider, String organization, String project,
                             String repoId, String branch, ConfigEntity configEntity) {
        try {
            factory.getRepoService(provider).pushFile(
                pat,
                organization,
                project,
                repoId,
                CONFIG_FILE_PATH,
                branch,
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(configEntity) + System.lineSeparator(),
                CONFIG_COMMIT_MESSAGE
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize config data", exception);
        }
    }
}