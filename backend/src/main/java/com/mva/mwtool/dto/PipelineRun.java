package com.mva.mwtool.dto;

import com.fasterxml.jackson.databind.JsonNode;
import com.mva.mwtool.service.pipeline.PipelineGraph;
import com.mva.mwtool.service.pipeline.tasks.Task;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class PipelineRun {
    private PipelineGraph graph;
    private String pipelineRunName;
    private JsonNode pipeline;

    public Task findTaskById(String taskId) {
        return graph.getTaskById(taskId);
    }
}
