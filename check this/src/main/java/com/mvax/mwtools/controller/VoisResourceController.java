package com.mvax.mwtools.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mvax.mwtools.dto.ApiResult;
import com.mvax.mwtools.dto.DataRequest;
import com.mvax.mwtools.service.VoisResourceService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/vois-resources")
public class VoisResourceController {

    private final VoisResourceService voisResourceService;

    public VoisResourceController(VoisResourceService voisResourceService) {
        this.voisResourceService = voisResourceService;
    }

    /** List all VOIS resources — reads each file under db/vois-resources/ */
    @PostMapping("/list")
    public List<JsonNode> list(@RequestBody DataRequest req) {
        return voisResourceService.list(req);
    }

    /** Save a single VOIS resource as db/vois-resources/{id}.json */
    @PostMapping("/write")
    public ApiResult write(@RequestBody DataRequest req) {
        return voisResourceService.write(req);
    }

    /** Delete a single VOIS resource by id */
    @PostMapping("/delete")
    public ApiResult delete(@RequestBody DataRequest req) {
        return voisResourceService.delete(req);
    }
}
