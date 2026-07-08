package com.mva.mwtool.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.AzureCredentials;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.GitHubCredentials;
import com.mva.mwtool.entity.ConfigEntity;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

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
        ConfigEntity localConfig = readLocalConfig();
        if (localConfig != null) {
            return localConfig;
        }

        try {
            DevOpsContext context = createContext(provider, pat, organization, project);
            String content = context.getRepoService()
                .pullFile(repoId, CONFIG_FILE_PATH, branch)
                .getContent();

            ConfigEntity remoteConfig = objectMapper.readValue(content, ConfigEntity.class);
            writeLocalConfig(remoteConfig);
            return remoteConfig;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Invalid config file format", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load config from provider repo", exception);
        }
    }

    public void updateConfig(String pat, String provider, String organization, String project,
                             String repoId, String branch, ConfigEntity configEntity) {
        writeLocalConfig(configEntity);

        try {
            DevOpsContext context = createContext(provider, pat, organization, project);
            context.getRepoService().pushFile(
                repoId,
                CONFIG_FILE_PATH,
                branch,
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(configEntity) + System.lineSeparator(),
                CONFIG_COMMIT_MESSAGE
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize config data", exception);
        } catch (Exception exception) {
            // Keep the local workspace file updated even when the remote provider write fails.
        }
    }

    private ConfigEntity readLocalConfig() {
        try {
            Path localConfigPath = resolveLocalConfigPath();
            if (localConfigPath == null || !Files.exists(localConfigPath)) {
                return null;
            }

            return objectMapper.readValue(Files.readString(localConfigPath), ConfigEntity.class);
        } catch (Exception exception) {
            return null;
        }
    }

    private void writeLocalConfig(ConfigEntity configEntity) {
        try {
            Path localConfigPath = resolveLocalConfigPath();
            if (localConfigPath == null) {
                return;
            }

            Files.createDirectories(localConfigPath.getParent());
            Files.writeString(
                localConfigPath,
                objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(configEntity) + System.lineSeparator()
            );
        } catch (IOException exception) {
            throw new IllegalArgumentException("Could not update local config file", exception);
        }
    }

    private Path resolveLocalConfigPath() {
        List<Path> candidates = List.of(
            Path.of(CONFIG_FILE_PATH).normalize(),
            Path.of("..", CONFIG_FILE_PATH).normalize()
        );

        for (Path candidate : candidates) {
            if (Files.exists(candidate)) {
                return candidate;
            }
        }

        return candidates.get(1);
    }

    private DevOpsContext createContext(String provider, String pat, String organization, String project) {
        DevOpsCredentials credentials = new DevOpsCredentials();
        if ("azure".equalsIgnoreCase(provider)) {
            credentials.setAzure(new AzureCredentials(pat, organization, project));
        } else if ("github".equalsIgnoreCase(provider)) {
            credentials.setGithub(new GitHubCredentials(pat, organization, project));
        }
        return factory.create(provider, credentials);
    }
}