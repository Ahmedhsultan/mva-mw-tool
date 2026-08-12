package com.mva.mwtool.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.Pipeline;
import com.mva.mwtool.enums.TaskStatus;
import com.mva.mwtool.repository.PipelineRepository;
import com.mva.mwtool.service.pipeline.PipelineGraph;
import com.mva.mwtool.service.pipeline.PipelineRunsRepo;
import com.mva.mwtool.service.pipeline.tasks.Task;
import com.mva.mwtool.service.pipeline.util.TaskGraphBuilder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class PipelineService {

    private final DevOpsServiceFactory devOpsServiceFactory;
    private final PipelineRepository pipelineRepository;

    public PipelineService(DevOpsServiceFactory devOpsServiceFactory, PipelineRepository pipelineRepository) {
        this.devOpsServiceFactory = devOpsServiceFactory;
        this.pipelineRepository = pipelineRepository;
    }

    public boolean createPipeline(String pat, String provider, String organization, String project,
                                  String repoId, String branch, JsonNode pipelineStructure, String pipelineName) {
        List<Pipeline> pipelines = new ArrayList<>(pipelineRepository.readPipelines(
            pat,
            provider,
            organization,
            project,
            repoId,
            branch
        ));

        pipelines.removeIf(pipeline -> pipeline.getPipelineName().equals(pipelineName));
        pipelines.add(new Pipeline(pipelineName, pipelineStructure));

        pipelineRepository.updatePipelines(pat, provider, organization, project, repoId, branch, pipelines);
        return true;
    }

    public TaskStatus getTaskStatus(String pipelineRunName, String taskId) {
        return PipelineRunsRepo.getPipelineRuns()
                .stream()
                .filter(p -> p.getPipelineRunName().equals(pipelineRunName))
                .findFirst().get()
                .getTaskById(taskId)
                .getStatus();
    }

    public List<PipelineGraph> getAllPipelineRuns() {
        return PipelineRunsRepo.getPipelineRuns();
    }

    public List<Pipeline> getAllPipelines(String pat, String provider, String organization, String project,
                                          String repoId, String branch) {
        return pipelineRepository.readPipelines(pat, provider, organization, project, repoId, branch);
    }

    public boolean runPipeline(String pat, String provider, String organization, String project,
                               String repoId, String branch, String pipelineName, DevOpsCredentials devOpsCredentials) {
        Pipeline pipeline = pipelineRepository.findPipeline(pat, provider, organization, project, repoId, branch, pipelineName)
            .orElseThrow(() -> new IllegalArgumentException("Pipeline not found: " + pipelineName));

        // Use run-time credentials as provided. GitHub task repoName values are applied per task inside TaskGraphBuilder.
        PipelineGraph graph = TaskGraphBuilder.build(pipeline.getPipelineStructure(), devOpsServiceFactory, devOpsCredentials);

        PipelineRunsRepo.getPipelineRuns().add(graph);
        graph.startOrchestration();
        return true;
    }

    public boolean deletePipeline(String pat, String provider, String organization, String project,
                                   String repoId, String branch, String pipelineName) {
        List<Pipeline> pipelines = new ArrayList<>(pipelineRepository.readPipelines(
            pat, provider, organization, project, repoId, branch
        ));

        boolean removed = pipelines.removeIf(pipeline -> pipeline.getPipelineName().equals(pipelineName));
        if (!removed) {
            throw new IllegalArgumentException("Pipeline not found: " + pipelineName);
        }

        pipelineRepository.updatePipelines(pat, provider, organization, project, repoId, branch, pipelines);
        return true;
    }

    public void stopPipelineRun(String pipelineRunName) {
        PipelineGraph graph = PipelineRunsRepo.getPipelineRuns().stream()
                .filter(p -> p.getPipelineRunName().equals(pipelineRunName))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Run not found: " + pipelineRunName));
        graph.stopAll();
    }

    public void rerunTask(String pipelineRunName, String taskId) {
        Task task = findTask(pipelineRunName, taskId);
        task.forceRun();
    }

    public void stopTask(String pipelineRunName, String taskId) {
        Task task = findTask(pipelineRunName, taskId);
        task.forceStop();
    }

    private Task findTask(String pipelineRunName, String taskId) {
        return PipelineRunsRepo.getPipelineRuns().stream()
                .filter(p -> p.getPipelineRunName().equals(pipelineRunName))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Run not found: " + pipelineRunName))
                .getTaskById(taskId);
    }
}
