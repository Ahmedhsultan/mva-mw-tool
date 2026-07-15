package com.mva.mwtool.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.AzureCredentials;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.GitHubCredentials;
import com.mva.mwtool.dto.RepoFileDto;
import com.mva.mwtool.dto.VoisResourceDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import org.springframework.web.client.HttpClientErrorException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Repository
public class VoisResourceRepository {

    private static final String RESOURCES_DIRECTORY_PATH = "db/vois-resources";
    private static final String DEFAULT_BRANCH = "main";
    private static final String ADD_RESOURCE_COMMIT_MESSAGE = "Add resource entry";
    private static final String DELETE_RESOURCE_COMMIT_MESSAGE = "Delete resource entry";

    private static final Comparator<VoisResourceDto> RESOURCE_ORDER = Comparator
        .comparing((VoisResourceDto resource) -> safeValue(resource.getCategory()), String.CASE_INSENSITIVE_ORDER)
        .thenComparing(resource -> safeValue(resource.getLabel()), String.CASE_INSENSITIVE_ORDER);

    private final ObjectMapper objectMapper;
    private final DevOpsServiceFactory factory;

    public VoisResourceRepository(ObjectMapper objectMapper, DevOpsServiceFactory factory) {
        this.objectMapper = objectMapper;
        this.factory = factory;
    }

    public List<VoisResourceDto> listResources(String pat, String provider, String organization, String project,
                                               String repoId, String branch) {
        try {
            DevOpsContext context = createContext(provider, pat, organization, project);
            String resolvedRepoId = requireRepoId(repoId);
            String resolvedBranch = resolveBranch(branch);

            List<String> filePaths = context.getRepoService().listFilePaths(
                resolvedRepoId,
                RESOURCES_DIRECTORY_PATH,
                resolvedBranch
            );

            List<VoisResourceDto> resources = filePaths.parallelStream()
                .filter(filePath -> filePath.endsWith(".json"))
                .map(filePath -> readRemoteResource(context, resolvedRepoId, resolvedBranch, filePath))
                .collect(Collectors.toCollection(ArrayList::new));

            resources.sort(RESOURCE_ORDER);
            return resources;
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode() == HttpStatus.NOT_FOUND) {
                return new ArrayList<>();
            }
            throw new IllegalArgumentException("Could not load resource catalog: " + exception.getStatusText(), exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load resource catalog: " + exception.getMessage(), exception);
        }
    }

    public VoisResourceDto saveCustomResource(String pat, String provider, String organization, String project,
                                              String repoId, String branch, VoisResourceDto resource) {
        try {
            String resourceId = hasText(resource.getId()) ? resource.getId().trim() : UUID.randomUUID().toString();
            VoisResourceDto persistedResource = new VoisResourceDto(
                resourceId,
                resource.getLabel(),
                resource.getDescription(),
                resource.getUrl(),
                resource.getType(),
                resource.getCategory(),
                true
            );

            String content = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(persistedResource)
                + System.lineSeparator();

            DevOpsContext context = createContext(provider, pat, organization, project);
            context.getRepoService().pushFile(
                requireRepoId(repoId),
                resourceFilePath(resourceId),
                resolveBranch(branch),
                content,
                ADD_RESOURCE_COMMIT_MESSAGE
            );

            return persistedResource;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not serialize resource entry", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not update resource catalog in repository", exception);
        }
    }

    public Optional<VoisResourceDto> findResource(String pat, String provider, String organization, String project,
                                                  String repoId, String branch, String resourceId) {
        try {
            DevOpsContext context = createContext(provider, pat, organization, project);
            RepoFileDto file = context.getRepoService().pullFile(
                requireRepoId(repoId),
                resourceFilePath(resourceId),
                resolveBranch(branch)
            );

            VoisResourceDto resource = objectMapper.readValue(file.getContent(), VoisResourceDto.class);
            resource.setIsCustom(Boolean.TRUE.equals(resource.getIsCustom()));
            return Optional.of(resource);
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode() == HttpStatus.NOT_FOUND) {
                return Optional.empty();
            }
            throw new IllegalArgumentException("Could not load resource entry: " + exception.getStatusText(), exception);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not parse resource entry", exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load resource entry: " + exception.getMessage(), exception);
        }
    }

    public boolean deleteCustomResource(String pat, String provider, String organization, String project,
                                        String repoId, String branch, String resourceId) {
        try {
            DevOpsContext context = createContext(provider, pat, organization, project);
            context.getRepoService().deleteFile(
                requireRepoId(repoId),
                resourceFilePath(resourceId),
                resolveBranch(branch),
                DELETE_RESOURCE_COMMIT_MESSAGE
            );
            return true;
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode() == HttpStatus.NOT_FOUND) {
                return false;
            }
            throw new IllegalArgumentException("Could not delete resource entry: " + exception.getStatusText(), exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not delete resource entry: " + exception.getMessage(), exception);
        }
    }

    private VoisResourceDto readRemoteResource(DevOpsContext context, String repoId, String branch, String filePath) {
        try {
            RepoFileDto file = context.getRepoService().pullFile(repoId, filePath, branch);
            VoisResourceDto resource = objectMapper.readValue(file.getContent(), VoisResourceDto.class);
            resource.setIsCustom(Boolean.TRUE.equals(resource.getIsCustom()));
            return resource;
        } catch (HttpClientErrorException exception) {
            throw exception;
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Could not parse resource file: " + filePath, exception);
        } catch (Exception exception) {
            throw new IllegalArgumentException("Could not load resource file: " + filePath + ": " + exception.getMessage(), exception);
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
            throw new IllegalArgumentException("Resource repo is missing");
        }

        return normalizedRepoId;
    }

    private String resolveBranch(String branch) {
        String normalizedBranch = branch == null ? "" : branch.trim();
        return normalizedBranch.isEmpty() ? DEFAULT_BRANCH : normalizedBranch;
    }

    private String resourceFilePath(String resourceId) {
        return RESOURCES_DIRECTORY_PATH + "/" + resourceId.trim() + ".json";
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private static String safeValue(String value) {
        return value == null ? "" : value;
    }
}