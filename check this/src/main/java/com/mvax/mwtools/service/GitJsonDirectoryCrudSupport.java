package com.mvax.mwtools.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DataRequest;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class GitJsonDirectoryCrudSupport {

    private final JsonDbService dbService;
    private final ObjectMapper mapper;

    public GitJsonDirectoryCrudSupport(JsonDbService dbService, ObjectMapper mapper) {
        this.dbService = dbService;
        this.mapper = mapper;
    }

    public List<JsonNode> listDirectory(DataRequest req, String dirPath) {
        List<String> paths = dbService.listFiles(req.patConfig(), req.repo(), req.branch(), dirPath);
        List<JsonNode> records = new ArrayList<>();
        for (String path : paths) {
            JsonNode node = dbService.readFile(req.patConfig(), req.repo(), req.branch(), path);
            if (node != null) records.add(node);
        }
        return records;
    }

    public ApiResult writeToDirectory(DataRequest req, String dirPath) {
        JsonNode data = mapper.valueToTree(req.data());
        String id = data != null && data.has("id") ? data.get("id").asText() : null;
        if (id == null || id.isBlank()) {
            id = UUID.randomUUID().toString();
        }
        String filePath = dirPath + "/" + id + ".json";
        return dbService.writeFile(req.patConfig(), req.repo(), req.branch(), filePath, req.data(), req.comment());
    }

    public ApiResult deleteFromDirectory(
            DataRequest req,
            String dirPath,
            String missingIdMessage,
            String defaultDeleteCommentPrefix
    ) {
        JsonNode data = mapper.valueToTree(req.data());
        String id = data != null && data.has("id") ? data.get("id").asText() : null;
        if (id == null || id.isBlank()) {
            return ApiResult.fail(missingIdMessage);
        }
        String filePath = dirPath + "/" + id + ".json";
        String comment = req.comment() != null ? req.comment() : (defaultDeleteCommentPrefix + " " + id);
        return dbService.deleteFile(req.patConfig(), req.repo(), req.branch(), filePath, comment);
    }
}
