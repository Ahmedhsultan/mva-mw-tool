package com.mva.mwtool.devops.auth;

import com.mva.mwtool.dto.AuthResponse;

public interface AuthService {

    AuthResponse validateToken(String pat, String organization, String project);
}
