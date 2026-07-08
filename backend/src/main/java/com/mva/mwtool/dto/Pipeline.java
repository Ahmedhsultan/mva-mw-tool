package com.mva.mwtool.dto;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class Pipeline {
    private String pipelineName;
    private JsonNode pipelineStructure;
}
