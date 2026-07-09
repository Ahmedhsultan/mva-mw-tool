package com.mvax.mwtools.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.PatConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * JSON DB Service — reads and writes JSON files via Azure DevOps Git API.
 * All persistence goes through the Git Items / Pushes API.
 */
@Service
public class JsonDbService {

    private static final Logger log = LoggerFactory.getLogger(JsonDbService.class);
    private final ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
    private final AzureDevOpsService azureService;

    public JsonDbService(AzureDevOpsService azureService) {
        this.azureService = azureService;
        log.info("JsonDbService initialized (Git API mode)");
    }

    /**
     * Read a JSON file from the Azure DevOps Git repo and parse it.
     */
    public JsonNode readFile(PatConfig pat, String repo, String branch, String filePath) {
        return azureService.readGitFileAsJson(pat, repo, branch, filePath);
    }

    /**
     * Write data to a JSON file in the Azure DevOps Git repo via a push.
     */
    public ApiResult writeFile(PatConfig pat, String repo, String branch, String filePath, Object data, String comment) {
        try {
            String content = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(data);
            return azureService.writeGitFile(pat, repo, branch, filePath, content, comment);
        } catch (Exception e) {
            log.error("Failed to write {}: {}", filePath, e.getMessage());
            return ApiResult.fail("Failed to serialize data: " + e.getMessage());
        }
    }

    /**
     * List all file paths under a directory in the Git repo.
     */
    public List<String> listFiles(PatConfig pat, String repo, String branch, String directoryPath) {
        return azureService.listGitFiles(pat, repo, branch, directoryPath);
    }

    /**
     * Delete a file from the Git repo.
     */
    public ApiResult deleteFile(PatConfig pat, String repo, String branch, String filePath, String comment) {
        return azureService.deleteGitFile(pat, repo, branch, filePath, comment);
    }
}
