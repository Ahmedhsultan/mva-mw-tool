package com.mvax.mwtools.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mvax.mwtools.dto.*;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ReservationService {

    private static final String DIR_PATH = "db/reservations";

    private final GitJsonDirectoryCrudSupport crud;
    private final AzureDevOpsService azureService;

    public ReservationService(GitJsonDirectoryCrudSupport crud, AzureDevOpsService azureService) {
        this.crud = crud;
        this.azureService = azureService;
    }

    public List<JsonNode> list(DataRequest req) {
        return crud.listDirectory(req, DIR_PATH);
    }

    public ApiResult write(DataRequest req) {
        return crud.writeToDirectory(req, DIR_PATH);
    }

    public ApiResult delete(DataRequest req) {
        return crud.deleteFromDirectory(req, DIR_PATH, "Missing reservation id", "Delete reservation");
    }

    public List<IterationResult> iterations(PatConfig pat, String team) {
        return azureService.getAllIterations(pat, team);
    }

    public BranchCheckResult checkBranch(BranchRequest req) {
        return azureService.checkBranchExists(req.patConfig(), req.repo(), req.releaseNumber(), req.branchName());
    }
}
