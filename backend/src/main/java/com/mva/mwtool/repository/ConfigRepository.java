package com.mva.mwtool.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.AzureCredentials;
import com.mva.mwtool.entity.ConfigEntity;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.GitHubCredentials;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.stereotype.Repository;

@Repository
public class ConfigRepository {

    private static final String CONFIG_FILE_PATH = "db/config/config.json";
    private static final String DEFAULT_BRANCH = "main";
    private static final String CONFIG_COMMIT_MESSAGE = "Update config catalog";

    private final ObjectMapper objectMapper;
    private final DevOpsServiceFactory factory;

    public ConfigRepository(ObjectMapper objectMapper, DevOpsServiceFactory factory) {
        this.objectMapper = objectMapper;
        this.factory = factory;
    }

    public ConfigEntity readConfig(String pat, String provider, String organization, String project,
                                   String repoId, String branch) {
        try {
            DevOpsContext context = createContext(provider, pat, organization, project);
            RepoFileDto file = context.getRepoService().pullFile(
                requireRepoId(repoId),
                CONFIG_FILE_PATH,
                resolveBranch(branch)
            );
            return objectMapper.readValue(file.getContent(), ConfigEntity.class);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not parse config file", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load config file from repository", exception);
        }
    }

    public void updateConfig(String pat, String provider, String organization, String project,
                             String repoId, String branch, ConfigEntity configEntity) {
        try {
            String content = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(configEntity)
                + System.lineSeparator();

            DevOpsContext context = createContext(provider, pat, organization, project);
            context.getRepoService().pushFile(
                requireRepoId(repoId),
                CONFIG_FILE_PATH,
                resolveBranch(branch),
                content,
                CONFIG_COMMIT_MESSAGE
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize config file", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not update config file in repository", exception);
        }
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

    private String requireRepoId(String repoId) {
        String normalizedRepoId = repoId == null ? "" : repoId.trim();
        if (normalizedRepoId.isEmpty()) {
            throw new IllegalArgumentException("Config repo is missing");
        }

        return normalizedRepoId;
    }

    private String resolveBranch(String branch) {
        String normalizedBranch = branch == null ? "" : branch.trim();
        return normalizedBranch.isEmpty() ? DEFAULT_BRANCH : normalizedBranch;
    }

}