package com.mva.mwtool.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.Pipeline;
import com.mva.mwtool.dto.PipelineRun;
import com.mva.mwtool.enums.TaskStatus;
import com.mva.mwtool.service.PipelineService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/pipelines")
public class PipelineController {

    private final PipelineService pipelineService;

    public PipelineController(PipelineService pipelineService) {
        this.pipelineService = pipelineService;
    }

    @PostMapping
    public ResponseEntity<Boolean> createPipeline(@RequestParam String pipelineName,
                                                  @RequestBody JsonNode pipelineStructure) {
        boolean result = pipelineService.createPipeline(pipelineStructure, pipelineName);
        return ResponseEntity.ok(result);
    }

    @GetMapping
    public ResponseEntity<List<Pipeline>> getAllPipelines() {
        return ResponseEntity.ok(pipelineService.getAllPipelines());
    }

    @GetMapping("/runs")
    public ResponseEntity<List<PipelineRun>> getAllPipelineRuns() {
        return ResponseEntity.ok(pipelineService.getAllPipelineRuns());
    }

    @PostMapping("/{pipelineName}/run")
    public ResponseEntity<Boolean> runPipeline(@PathVariable String pipelineName,
                                               @RequestBody DevOpsCredentials credentials) {
        boolean result = pipelineService.runPipeline(pipelineName, credentials);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/runs/{pipelineRunName}/tasks/{taskId}/status")
    public ResponseEntity<TaskStatus> getTaskStatus(@PathVariable String pipelineRunName,
                                                    @PathVariable String taskId) {
        TaskStatus status = pipelineService.getTaskStatus(pipelineRunName, taskId);
        return ResponseEntity.ok(status);
    }

    @PostMapping("/runs/{pipelineRunName}/stop")
    public ResponseEntity<Void> stopPipelineRun(@PathVariable String pipelineRunName) {
        pipelineService.stopPipelineRun(pipelineRunName);
        return ResponseEntity.ok().build();
    }
}

