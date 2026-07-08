package com.mva.mwtool.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.DevOpsCredentials;
import com.mva.mwtool.dto.Pipeline;
import com.mva.mwtool.dto.PipelineRun;
import com.mva.mwtool.service.pipeline.PipelineRunsRepo;
import com.mva.mwtool.service.pipeline.PipelinesRepo;
import com.mva.mwtool.service.pipeline.tasks.Task;
import com.mva.mwtool.service.pipeline.util.TaskDeserializer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class PipelineService {

    @Autowired
    private DevOpsServiceFactory devOpsServiceFactory;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public boolean createPipeline(JsonNode pipelineStructure, String pipelineName) {
        Pipeline pipeline = new Pipeline(pipelineName, pipelineStructure);
        PipelinesRepo.getPipelines().add(pipeline);
        return true;
    }

    public String getTaskStatus(String pipelineRunName, String taskId) {
        return PipelineRunsRepo.getPipelineRuns()
                .stream()
                .filter(p -> p.getPipelineRunName().equals(pipelineRunName))
                .findFirst().get()
                .findTaskById(taskId)
                .getStatus();
    }

    public List<PipelineRun> getAllPipelineRuns() {
        return PipelineRunsRepo.getPipelineRuns();
    }

    public List<Pipeline> getAllPipelines() {
        return PipelinesRepo.getPipelines();
    }

    public boolean runPipeline(String pipelineName, DevOpsCredentials devOpsCredentials) {
        Pipeline pipeline = PipelinesRepo.getPipelines()
                .stream()
                .filter(p -> p.getPipelineName().equals(pipelineName))
                .findFirst().get();

        TaskDeserializer.setDevOpsServiceFactory(devOpsServiceFactory);
        TaskDeserializer.setCredentials(devOpsCredentials);
        Task rootTask = objectMapper.convertValue(pipeline.getPipelineStructure(), Task.class);

        rootTask.run();

        PipelineRun pipelineRun = new PipelineRun(rootTask, UUID.randomUUID().toString(), pipeline.getPipelineStructure());
        PipelineRunsRepo.getPipelineRuns().add(pipelineRun);
        return true;
    }

    public void stopPipelineRun(String pipelineRunName) {
        // To Be Implemented later
    }
}
