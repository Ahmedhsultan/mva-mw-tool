package com.mva.mwtool.service.pipeline;

import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

public class PipelineRunsRepo {
    @Getter
    private static final List<PipelineGraph> pipelineRuns = new ArrayList<>();

    private PipelineRunsRepo() {}
}
