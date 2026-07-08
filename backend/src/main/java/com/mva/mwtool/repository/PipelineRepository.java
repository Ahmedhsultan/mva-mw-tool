package com.mva.mwtool.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.AzureCredentials;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.GitHubCredentials;
import com.mva.mwtool.dto.Pipeline;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import org.springframework.web.client.HttpClientErrorException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Repository
public class PipelineRepository {

    private static final String PIPELINES_FILE_PATH = "db/pipelines/pipelines.json";
    private static final String DEFAULT_BRANCH = "main";
    private static final String PIPELINES_COMMIT_MESSAGE = "Update pipeline catalog";

    private final ObjectMapper objectMapper;
    private final DevOpsServiceFactory factory;

    public PipelineRepository(ObjectMapper objectMapper, DevOpsServiceFactory factory) {
        this.objectMapper = objectMapper;
        this.factory = factory;
    }

    public List<Pipeline> readPipelines(String pat, String provider, String organization, String project,
                                        String repoId, String branch) {
        try {
            DevOpsContext context = createContext(provider, pat, organization, project);
            RepoFileDto file = context.getRepoService().pullFile(
                requireRepoId(repoId),
                PIPELINES_FILE_PATH,
                resolveBranch(branch)
            );

            List<Pipeline> pipelines = objectMapper.readValue(
                file.getContent(),
                objectMapper.getTypeFactory().constructCollectionType(List.class, Pipeline.class)
            );

            pipelines.sort(Comparator.comparing(Pipeline::getPipelineName, String.CASE_INSENSITIVE_ORDER));
            return pipelines;
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode() == HttpStatus.NOT_FOUND) {
                return new ArrayList<>();
            }
            throw new IllegalArgumentException("Could not load pipeline catalog from repository", exception);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not parse pipeline catalog", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load pipeline catalog from repository", exception);
        }
    }

    public Optional<Pipeline> findPipeline(String pat, String provider, String organization, String project,
                                           String repoId, String branch, String pipelineName) {
        return readPipelines(pat, provider, organization, project, repoId, branch)
            .stream()
            .filter(pipeline -> pipeline.getPipelineName().equals(pipelineName))
            .findFirst();
    }

    public void updatePipelines(String pat, String provider, String organization, String project,
                                String repoId, String branch, List<Pipeline> pipelines) {
        try {
            List<Pipeline> sortedPipelines = new ArrayList<>(pipelines);
            sortedPipelines.sort(Comparator.comparing(Pipeline::getPipelineName, String.CASE_INSENSITIVE_ORDER));

            String content = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(sortedPipelines)
                + System.lineSeparator();

            DevOpsContext context = createContext(provider, pat, organization, project);
            context.getRepoService().pushFile(
                requireRepoId(repoId),
                PIPELINES_FILE_PATH,
                resolveBranch(branch),
                content,
                PIPELINES_COMMIT_MESSAGE
            );
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize pipeline catalog", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not update pipeline catalog in repository", exception);
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
            throw new IllegalArgumentException("Pipeline repo is missing");
        }

        return normalizedRepoId;
    }

    private String resolveBranch(String branch) {
        String normalizedBranch = branch == null ? "" : branch.trim();
        return normalizedBranch.isEmpty() ? DEFAULT_BRANCH : normalizedBranch;
    }
}