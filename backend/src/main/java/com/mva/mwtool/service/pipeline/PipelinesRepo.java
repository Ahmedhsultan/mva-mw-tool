package com.mva.mwtool.service.pipeline;


import com.mva.mwtool.dto.Pipeline;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

public class PipelinesRepo {
    @Getter
    private static final List<Pipeline> pipelines = new ArrayList<>();

    private PipelinesRepo() {}
}
