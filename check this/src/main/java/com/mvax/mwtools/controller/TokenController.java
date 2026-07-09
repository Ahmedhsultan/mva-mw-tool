package com.mvax.mwtools.controller;

import com.mvax.mwtools.dto.TokenRequest;
import com.mvax.mwtools.dto.TokenResponse;
import com.mvax.mwtools.service.TokenService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/token")
public class TokenController {

    private final TokenService tokenService;

    public TokenController(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @PostMapping("/generate")
    public TokenResponse generateToken(@RequestBody TokenRequest request) {
        return tokenService.generateToken(request);
    }
}
