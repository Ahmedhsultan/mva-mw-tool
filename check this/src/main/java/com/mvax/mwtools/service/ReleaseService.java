package com.mvax.mwtools.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DataRequest;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ReleaseService {

    private static final String DIR_PATH = "db/releases";

    private final GitJsonDirectoryCrudSupport crud;

    public ReleaseService(GitJsonDirectoryCrudSupport crud) {
        this.crud = crud;
    }

    public List<JsonNode> list(DataRequest req) {
        return crud.listDirectory(req, DIR_PATH);
    }

    public ApiResult write(DataRequest req) {
        return crud.writeToDirectory(req, DIR_PATH);
    }

    public ApiResult delete(DataRequest req) {
        return crud.deleteFromDirectory(req, DIR_PATH, "Missing release id", "Delete release");
    }
}
