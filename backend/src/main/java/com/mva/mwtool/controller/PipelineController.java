package com.mva.mwtool.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.Pipeline;
import com.mva.mwtool.enums.TaskStatus;
import com.mva.mwtool.service.PipelineService;
import com.mva.mwtool.service.pipeline.PipelineGraph;
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
    public ResponseEntity<Boolean> createPipeline(@RequestHeader("X-PAT") String pat,
                                                  @RequestParam String provider,
                                                  @RequestParam String organization,
                                                  @RequestParam(required = false) String project,
                                                  @RequestParam String repoId,
                                                  @RequestParam(required = false) String branch,
                                                  @RequestParam String pipelineName,
                                                  @RequestBody JsonNode pipelineStructure) {
        boolean result = pipelineService.createPipeline(
            pat,
            provider,
            organization,
            project,
            repoId,
            branch,
            pipelineStructure,
            pipelineName
        );
        return ResponseEntity.ok(result);
    }

    @GetMapping
    public ResponseEntity<List<Pipeline>> getAllPipelines(@RequestHeader("X-PAT") String pat,
                                                          @RequestParam String provider,
                                                          @RequestParam String organization,
                                                          @RequestParam(required = false) String project,
                                                          @RequestParam String repoId,
                                                          @RequestParam(required = false) String branch) {
        return ResponseEntity.ok(pipelineService.getAllPipelines(pat, provider, organization, project, repoId, branch));
    }

    @DeleteMapping("/{pipelineName}")
    public ResponseEntity<Boolean> deletePipeline(@RequestHeader("X-PAT") String pat,
                                                   @RequestParam String provider,
                                                   @RequestParam String organization,
                                                   @RequestParam(required = false) String project,
                                                   @RequestParam String repoId,
                                                   @RequestParam(required = false) String branch,
                                                   @PathVariable String pipelineName) {
        boolean result = pipelineService.deletePipeline(pat, provider, organization, project, repoId, branch, pipelineName);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/runs")
    public ResponseEntity<List<PipelineGraph>> getAllPipelineRuns() {
        return ResponseEntity.ok(pipelineService.getAllPipelineRuns());
    }

    @PostMapping("/{pipelineName}/run")
    public ResponseEntity<Boolean> runPipeline(@RequestHeader("X-PAT") String pat,
                                               @RequestParam String provider,
                                               @RequestParam String organization,
                                               @RequestParam(required = false) String project,
                                               @RequestParam String repoId,
                                               @RequestParam(required = false) String branch,
                                               @PathVariable String pipelineName,
                                               @RequestBody DevOpsCredentials credentials) {
        boolean result = pipelineService.runPipeline(
            pat,
            provider,
            organization,
            project,
            repoId,
            branch,
            pipelineName,
            credentials
        );
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

    @PostMapping("/runs/{pipelineRunName}/tasks/{taskId}/rerun")
    public ResponseEntity<Void> rerunTask(@PathVariable String pipelineRunName,
                                          @PathVariable String taskId) {
        pipelineService.rerunTask(pipelineRunName, taskId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/runs/{pipelineRunName}/tasks/{taskId}/stop")
    public ResponseEntity<Void> stopTask(@PathVariable String pipelineRunName,
                                         @PathVariable String taskId) {
        pipelineService.stopTask(pipelineRunName, taskId);
        return ResponseEntity.ok().build();
    }
}

