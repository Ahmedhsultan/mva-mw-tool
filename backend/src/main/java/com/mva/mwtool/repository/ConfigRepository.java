package com.mva.mwtool.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.entity.ConfigEntity;
import org.springframework.stereotype.Repository;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@Repository
public class ConfigRepository {

    private static final String CONFIG_FILE_PATH = "db/config/config.json";
    private final ObjectMapper objectMapper;

    public ConfigRepository(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public ConfigEntity readConfig(String pat, String provider, String organization, String project,
                                   String repoId, String branch) {
        ConfigEntity localConfig = readLocalConfig();
        if (localConfig != null) {
            return localConfig;
        }

        throw new IllegalArgumentException("Could not load local config file");
    }

    public void updateConfig(String pat, String provider, String organization, String project,
                             String repoId, String branch, ConfigEntity configEntity) {
        writeLocalConfig(configEntity);
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

}