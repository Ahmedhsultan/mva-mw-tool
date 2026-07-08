package com.mva.mwtool.service.pipeline;


import com.mva.mwtool.dto.PipelineRun;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

public class PipelineRunsRepo {
    @Getter
    private static final List<PipelineRun> pipelineRuns = new ArrayList<>();

    private PipelineRunsRepo() {}
}
