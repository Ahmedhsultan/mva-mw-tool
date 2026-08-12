package com.mva.mwtool.controller;

import com.mva.mwtool.devops.DevOpsContext;
import com.mva.mwtool.devops.DevOpsServiceFactory;
import com.mva.mwtool.dto.*;
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
        DevOpsCredentials credentials = buildCredentials(request.getProvider(),
                request.getPat(), request.getOrganization(), request.getProject());
        DevOpsContext context = factory.create(request.getProvider(), credentials);
        AuthResponse response = context.getAuthService().validateToken();
        return ResponseEntity.ok(response);
    }

    private DevOpsCredentials buildCredentials(String provider, String pat, String organization, String project) {
        DevOpsCredentials credentials = new DevOpsCredentials();
        credentials.setConnectors(java.util.Map.of(provider.toLowerCase(),
                new ConnectorCredentials(provider.toLowerCase(), pat, organization, project)));
        return credentials;
    }
}
