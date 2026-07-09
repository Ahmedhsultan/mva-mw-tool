package com.mvax.mwtools.service;

import com.mvax.mwtools.dto.TokenRequest;
import com.mvax.mwtools.dto.TokenResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TokenService {

    private static final Logger log = LoggerFactory.getLogger(TokenService.class);

    public TokenResponse generateToken(TokenRequest request) {
        if (request.msisdn() == null || request.msisdn().isBlank()) {
            return TokenResponse.fail("MSISDN is required");
        }
        if (request.server() == null || request.server().isBlank()) {
            return TokenResponse.fail("Server is required");
        }

        String loaLevel = request.loaLevel();
        if (loaLevel == null || loaLevel.isBlank()) {
            loaLevel = "LOA1";
        }

        try {
            LOA1TokenGenerator generator = new LOA1TokenGenerator(request.server());
            String token;
            if ("LOA3".equalsIgnoreCase(loaLevel)) {
                token = generator.getLOA3Token(request.msisdn());
            } else {
                token = generator.getLOA1Token(request.msisdn());
            }
            return TokenResponse.ok(token);
        } catch (Exception e) {
            log.error("Token generation failed for MSISDN={} server={} loa={}", request.msisdn(), request.server(), loaLevel, e);
            StringBuilder msg = new StringBuilder(e.toString());
            Throwable cause = e.getCause();
            while (cause != null) {
                msg.append(" → ").append(cause);
                cause = cause.getCause();
            }
            return TokenResponse.fail("Token generation failed: " + msg);
        }
    }
}
