package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.AuthRequest;
import com.mva.mwtool.dto.AuthResponse;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final DevOpsServiceFactory factory;

    public AuthController(DevOpsServiceFactory factory) {
        this.factory = factory;
    }

    @PostMapping("/validate")
    public ResponseEntity<AuthResponse> validateToken(@Valid @RequestBody AuthRequest request) {
        AuthResponse response = factory.getAuthService(request.getProvider())
                .validateToken(request.getPat(), request.getOrganization(), request.getProject());
        return ResponseEntity.ok(response);
    }
}
