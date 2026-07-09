package com.mvax.mwtools.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.mvax.mwtools.dto.*;
import com.mvax.mwtools.service.ReservationService;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/reservations")
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    /** List all reservations — reads each file under db/reservations/ */
    @PostMapping("/list")
    public List<JsonNode> list(@RequestBody DataRequest req) {
        return reservationService.list(req);
    }

    /** Save a single reservation as db/reservations/{id}.json */
    @PostMapping("/write")
    public ApiResult write(@RequestBody DataRequest req) {
        return reservationService.write(req);
    }

    /** Delete a single reservation by id */
    @PostMapping("/delete")
    public ApiResult delete(@RequestBody DataRequest req) {
        return reservationService.delete(req);
    }

    @PostMapping("/iterations")
    public List<IterationResult> iterations(@RequestBody PatConfig pat,
                                            @RequestParam(defaultValue = "MVA-Nubia") String team) {
        return reservationService.iterations(pat, team);
    }

    @PostMapping("/check-branch")
    public BranchCheckResult checkBranch(@RequestBody BranchRequest req) {
        return reservationService.checkBranch(req);
    }
}
