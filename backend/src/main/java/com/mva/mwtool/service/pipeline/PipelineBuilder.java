package com.mva.mwtool.service.pipeline;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.service.pipeline.tasks.Task;

public class PipelineBuilder {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    public static Task build(JsonNode pipelineStructure, DevOpsServiceFactory devOpsServiceFactory) {
        TaskDeserializer.setDevOpsServiceFactory(devOpsServiceFactory);
        return objectMapper.convertValue(pipelineStructure, Task.class);
    }
}
