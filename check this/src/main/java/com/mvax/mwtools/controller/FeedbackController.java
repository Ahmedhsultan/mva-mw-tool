package com.mvax.mwtools.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DataRequest;
import com.mvax.mwtools.service.FeedbackService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {

    private final FeedbackService feedbackService;

    public FeedbackController(FeedbackService feedbackService) {
        this.feedbackService = feedbackService;
    }

    /** List all feedback entries — reads each file under db/feedback/ */
    @PostMapping("/list")
    public List<JsonNode> list(@RequestBody DataRequest req) {
        return feedbackService.list(req);
    }

    /** Save a single feedback entry as db/feedback/{id}.json */
    @PostMapping("/write")
    public ApiResult write(@RequestBody DataRequest req) {
        return feedbackService.write(req);
    }

    /** Delete a single feedback entry by id */
    @PostMapping("/delete")
    public ApiResult delete(@RequestBody DataRequest req) {
        return feedbackService.delete(req);
    }
}
