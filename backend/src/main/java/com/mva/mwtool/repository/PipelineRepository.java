package com.mva.mwtool.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.ConnectorCredentials;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.Pipeline;
import com.mva.mwtool.dto.RepoFileDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import org.springframework.web.client.HttpClientErrorException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.UUID;

@Repository
public class PipelineRepository {

    private static final String PIPELINES_DIRECTORY_PATH = "db/pipelines";
    private static final String LEGACY_PIPELINES_FILE_PATH = "db/pipelines/pipelines.json";
    private static final String DEFAULT_BRANCH = "main";
    private static final String PIPELINE_COMMIT_MESSAGE = "Upsert pipeline entry";
    private static final String DELETE_PIPELINE_COMMIT_MESSAGE = "Delete pipeline entry";

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
            String resolvedRepoId = requireRepoId(repoId);
            String resolvedBranch = resolveBranch(branch);
            Map<String, Pipeline> pipelinesByName = new LinkedHashMap<>();

            readLegacyCatalog(context, resolvedRepoId, resolvedBranch)
                .forEach(pipeline -> pipelinesByName.put(normalizedPipelineKey(pipeline), pipeline));

            for (String filePath : listPipelineFilePaths(context, resolvedRepoId, resolvedBranch)) {
                if (!filePath.endsWith(".json") || LEGACY_PIPELINES_FILE_PATH.equals(filePath)) {
                    continue;
                }

                Pipeline pipeline = readPipelineFile(context, resolvedRepoId, resolvedBranch, filePath);
                pipelinesByName.put(normalizedPipelineKey(pipeline), pipeline);
            }

            List<Pipeline> pipelines = new ArrayList<>(pipelinesByName.values());

            pipelines.sort(Comparator.comparing(Pipeline::getPipelineName, String.CASE_INSENSITIVE_ORDER));
            return pipelines;
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode() == HttpStatus.NOT_FOUND) {
                return new ArrayList<>();
            }
            throw new IllegalArgumentException("Could not load pipeline catalog: " + exception.getStatusText(), exception);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not parse pipeline catalog", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load pipeline catalog: " + exception.getMessage(), exception);
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

            DevOpsContext context = createContext(provider, pat, organization, project);
            String resolvedRepoId = requireRepoId(repoId);
            String resolvedBranch = resolveBranch(branch);

            Map<String, Pipeline> desiredFiles = new LinkedHashMap<>();
            for (Pipeline pipeline : sortedPipelines) {
                desiredFiles.put(pipelineFilePath(pipeline.getPipelineName()), pipeline);
            }

            for (Map.Entry<String, Pipeline> entry : desiredFiles.entrySet()) {
                String content = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(entry.getValue())
                    + System.lineSeparator();

                context.getRepoService().pushFile(
                    resolvedRepoId,
                    entry.getKey(),
                    resolvedBranch,
                    content,
                    PIPELINE_COMMIT_MESSAGE
                );
            }

            for (String existingFilePath : listPipelineFilePaths(context, resolvedRepoId, resolvedBranch)) {
                if (LEGACY_PIPELINES_FILE_PATH.equals(existingFilePath)) {
                    context.getRepoService().deleteFile(
                        resolvedRepoId,
                        existingFilePath,
                        resolvedBranch,
                        DELETE_PIPELINE_COMMIT_MESSAGE
                    );
                    continue;
                }

                if (existingFilePath.endsWith(".json") && !desiredFiles.containsKey(existingFilePath)) {
                    context.getRepoService().deleteFile(
                        resolvedRepoId,
                        existingFilePath,
                        resolvedBranch,
                        DELETE_PIPELINE_COMMIT_MESSAGE
                    );
                }
            }
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize pipeline catalog", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not update pipeline catalog in repository", exception);
        }
    }

    private DevOpsContext createContext(String provider, String pat, String organization, String project) {
        DevOpsCredentials credentials = new DevOpsCredentials();
        credentials.setConnectors(java.util.Map.of(provider.toLowerCase(),
                new ConnectorCredentials(provider.toLowerCase(), pat, organization, project)));
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

    private List<Pipeline> readLegacyCatalog(DevOpsContext context, String repoId, String branch) throws JsonProcessingException {
        try {
            RepoFileDto file = context.getRepoService().pullFile(repoId, LEGACY_PIPELINES_FILE_PATH, branch);
            return objectMapper.readValue(
                file.getContent(),
                objectMapper.getTypeFactory().constructCollectionType(List.class, Pipeline.class)
            );
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode() == HttpStatus.NOT_FOUND) {
                return List.of();
            }
            throw exception;
        }
    }

    private List<String> listPipelineFilePaths(DevOpsContext context, String repoId, String branch) {
        try {
            return context.getRepoService().listFilePaths(repoId, PIPELINES_DIRECTORY_PATH, branch);
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode() == HttpStatus.NOT_FOUND) {
                return List.of();
            }
            throw exception;
        }
    }

    private Pipeline readPipelineFile(DevOpsContext context, String repoId, String branch, String filePath)
        throws JsonProcessingException {
        RepoFileDto file = context.getRepoService().pullFile(repoId, filePath, branch);
        return objectMapper.readValue(file.getContent(), Pipeline.class);
    }

    private String normalizedPipelineKey(Pipeline pipeline) {
        String name = pipeline == null || pipeline.getPipelineName() == null ? "" : pipeline.getPipelineName().trim();
        return name.toLowerCase(Locale.ROOT);
    }

    private String pipelineFilePath(String pipelineName) {
        String safeName = pipelineName == null ? "" : pipelineName.trim();
        String normalized = Normalizer.normalize(safeName, Normalizer.Form.NFKD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-+|-+$)", "");

        if (normalized.isBlank()) {
            normalized = "pipeline";
        }

        String suffix = UUID.nameUUIDFromBytes(safeName.getBytes(StandardCharsets.UTF_8)).toString().substring(0, 8);
        return PIPELINES_DIRECTORY_PATH + "/" + normalized + "-" + suffix + ".json";
    }
}