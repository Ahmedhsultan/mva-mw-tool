package com.mvax.mwtools.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.restassured.response.Response;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.util.*;

import static io.restassured.RestAssured.given;

public class LOA1TokenGenerator {

    private static final Logger log = LoggerFactory.getLogger(LOA1TokenGenerator.class);

    private final String serverUrl;
    private final String cfAccessClientId;
    private final String cfAccessClientSecret;
    private final Properties systemProps = new Properties();

    public LOA1TokenGenerator(String server) {
        loadEnvProperties("config/env.properties");
        loadEnvProperties("config/api-url.properties");

        this.serverUrl = systemProps.getProperty(server);
        if (this.serverUrl == null || this.serverUrl.isBlank()) {
            throw new IllegalArgumentException("Unknown server: " + server);
        }
        systemProps.setProperty("url", this.serverUrl);

        Properties secrets = readPropertyFile("config/secrets.properties");
        this.cfAccessClientId = secrets.getProperty("CF-Access-Client-Id");
        this.cfAccessClientSecret = secrets.getProperty("CF-Access-Client-Secret");
    }

    // ───────────────────────── PUBLIC API ─────────────────────────

    public String getLOA1Token(String msisdn) {
        log.info("[LOA1] Starting token generation for MSISDN={}", msisdn);
        systemProps.setProperty("MSISDN", msisdn);

        log.info("[LOA1] Fetching content API for journey parameters...");
        Map<String, Object> targetAndQuery = getTargetAndQueryParameters("UPFRONT_LOGIN_FIRST_TIME");
        log.info("[LOA1] Content API target={}", targetAndQuery.get("TARGET"));

        log.info("[LOA1] Fetching Hansolo token...");
        HansoloResponse hansolo = getHansoloWithMSISDN(msisdn);
        log.info("[LOA1] Hansolo token received");

        HashMap<String, String> query = objectToMap(targetAndQuery.get("QUERY"));
        query.put("acr_values", "LOA:1 encryptedMsisdn:" + hansolo.mspHansoloToken
                + " deviceId:0d79ccf1-ff4a-41dc-b754-ed8c93ff9496");
        query.put("prompt", "none");

        log.info("[LOA1] Calling DXIDM authorize...");
        Map<String, String> codeWithCorrelation = dxidmRequest(targetAndQuery.get("TARGET").toString(), query);
        String code = codeWithCorrelation.get("code");
        log.info("[LOA1] DXIDM code={}", code);

        log.info("[LOA1] Fetching ID token...");
        IdTokenResponse idToken = getIdToken(code);
        log.info("[LOA1] Token generated successfully");
        return idToken.loaToken;
    }

    public String getLOA3Token(String msisdn) {
        log.info("[LOA3] Starting token generation for MSISDN={}", msisdn);
        systemProps.setProperty("MSISDN", msisdn);

        log.info("[LOA3] Fetching content API for journey parameters...");
        Map<String, Object> targetAndQuery = getTargetAndQueryParameters("UPFRONT_LOGIN_FIRST_TIME");
        log.info("[LOA3] Content API target={}", targetAndQuery.get("TARGET"));

        log.info("[LOA3] Fetching Hansolo token...");
        HansoloResponse hansolo = getHansoloWithMSISDN(msisdn);
        log.info("[LOA3] Hansolo token received");

        HashMap<String, String> query = objectToMap(targetAndQuery.get("QUERY"));
        query.put("acr_values", "LOA:3 encryptedMsisdn:" + hansolo.mspHansoloToken
                + " deviceId:0d79ccf1-ff4a-41dc-b754-ed8c93ff9496");

        log.info("[LOA3] Calling DXIDM authorize...");
        Map<String, String> codeWithCorrelation = dxidmRequest(targetAndQuery.get("TARGET").toString(), query);
        String code = codeWithCorrelation.get("code");
        log.info("[LOA3] DXIDM code={}", code);

        log.info("[LOA3] Fetching ID token...");
        IdTokenResponse idToken = getIdToken(code);
        log.info("[LOA3] Token generated successfully");
        return idToken.loaToken;
    }

    // ───────────────────────── DXIDM request ─────────────────────────

    private Map<String, String> dxidmRequest(String url, Map<String, String> queryParam) {
        HashMap<String, String> codeMap = new HashMap<>();
        Response response = given().relaxedHTTPSValidation()
                .cookie("vfukmvax", "Wj.d5#78L.kr-8")
                .header("CF-Access-Client-Id", cfAccessClientId)
                .header("CF-Access-Client-Secret", cfAccessClientSecret)
                .queryParams(queryParam)
                .redirects().follow(false)
                .when()
                .get(url);
        String redirect = response.getHeader("Location");
        codeMap.put("code", extractCodeFromUrl(redirect));
        codeMap.put("correlation", response.getHeader("x-correlation-id"));
        return codeMap;
    }

    private static String extractCodeFromUrl(String url) {
        try {
            return url.substring(url.lastIndexOf("code=") + 5, url.lastIndexOf("&"));
        } catch (Exception e) {
            return "No Code Found";
        }
    }

    // ───────────────────────── Content API ─────────────────────────

    private Map<String, Object> getTargetAndQueryParameters(String journeyName) {
        ContentResponse content = restGet("/app/api/v2/content", contentHeaders(), ContentResponse.class);
        Map<String, Object> result = new HashMap<>();
        for (ContentResponse.IdJourney idJourney : content.items.iD_JOURNEYS.idJourneys) {
            if (idJourney.journey.name.equals(journeyName)) {
                result.put("TARGET", idJourney.journey.target);
                ContentResponse.QUERY query = idJourney.journey.parameters.qUERY;
                if (query.acr_values != null && query.acr_values.contains("<platform_session_id>")) {
                    query.acr_values = query.acr_values.replace("<platform_session_id>", UUID.randomUUID().toString());
                }
                result.put("QUERY", query);
                break;
            }
        }
        return result;
    }

    // ───────────────────────── Hansolo API ─────────────────────────

    private HansoloResponse getHansoloWithMSISDN(String msisdn) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Device-Model", "iOS");
        headers.put("Manufacturer", "Apple");
        headers.put("Platform", "iOS");
        headers.put("App-Version", "10.13");
        headers.put("Device-UID", "iuiiuiuiuiu");
        headers.put("Subscription", msisdn);
        headers.put("OS-Version", "12.0");
        headers.put("authenticationToken", systemProps.getProperty("authenticationToken",
                "iTgXNCyUYSdVLOXZiQDSWAj2baDAUC0Hw0ySsp+pKNTKvY0+jOFppAsRr5XKIlPK9N93GL1G6YPlpRxmpA1tjeR7oCP+l2Fkr2IE9reAYKff+0Y1JqleJqFYtuvlus68vnLCndsuUzIcJht/N0R1A1h7GPahNYqQLa1KAdpI5npceSQXTOBSGov9Dsqd/um73aF9yx9V3OT0jjpyCGxC74rNLywp2lVmCeEQRcGkKvYZqwoghgEs7D7JPvKHtcGROjsbVgAUxyk10Su7/GeY1kSIkyPUajqn2qMCsVmU3tCCSzkdFezUIm9BNFx56egl04utKBv8F3Rwn+aCTxIROQ=="));
        return restGet("/app/api/v1/testHansolo", headers, HansoloResponse.class);
    }

    // ───────────────────────── ID Token API ─────────────────────────

    private IdTokenResponse getIdToken(String code) {
        Map<String, String> headers = new HashMap<>(generalHeaders());
        headers.put("Auth-Code", code);
        return restGet("/app/api/v1/idToken", headers, IdTokenResponse.class);
    }

    // ───────────────────────── REST wrapper ─────────────────────────

    private <T> T restGet(String endpoint, Map<String, String> headers, Class<T> responseClass) {
        return given()
                .relaxedHTTPSValidation()
                .headers(headers)
                .when()
                .get(serverUrl.concat(endpoint))
                .then()
                .extract()
                .as(responseClass);
    }

    // ───────────────────────── Headers ─────────────────────────

    private Map<String, String> generalHeaders() {
        Map<String, String> params = new HashMap<>();
        params.put("Device-Model", "iOS");
        params.put("Manufacturer", "Apple");
        params.put("Platform", "iOS");
        params.put("App-Version", prop("AppVersion", "10.54"));
        params.put("Device-UID", "iuiiuiuiuiu");
        params.put("Subscription", prop("MSISDN", ""));
        params.put("OS-Version", prop("OSVersion", "11.3"));
        params.put("Root-Subscription", "True");
        params.put("Subscription-Type", prop("SubscriptionType", "MPS"));
        params.put("authenticationToken", prop("authenticationToken",
                "iTgXNCyUYSdVLOXZiQDSWAj2baDAUC0Hw0ySsp+pKNTKvY0+jOFppAsRr5XKIlPK9N93GL1G6YPlpRxmpA1tjeR7oCP+l2Fkr2IE9reAYKff+0Y1JqleJqFYtuvlus68vnLCndsuUzIcJht/N0R1A1h7GPahNYqQLa1KAdpI5npceSQXTOBSGov9Dsqd/um73aF9yx9V3OT0jjpyCGxC74rNLywp2lVmCeEQRcGkKvYZqwoghgEs7D7JPvKHtcGROjsbVgAUxyk10Su7/GeY1kSIkyPUajqn2qMCsVmU3tCCSzkdFezUIm9BNFx56egl04utKBv8F3Rwn+aCTxIROQ=="));
        params.put("Loa1-Token", "");
        params.put("Loa3-Token", "");
        params.put("Segment", prop("Segment", "CONSUMER"));
        return params;
    }

    private Map<String, String> contentHeaders() {
        Map<String, String> params = new HashMap<>();
        params.put("App-Content-Type", "ID_JOURNEYS");
        params.putAll(generalHeaders());
        return params;
    }

    // ───────────────────────── Config loading ─────────────────────────

    private String prop(String key, String defaultValue) {
        return systemProps.getProperty(key, defaultValue);
    }

    private void loadEnvProperties(String resourcePath) {
        try {
            byte[] input = readResource(resourcePath);
            Properties properties = new Properties();
            try (ByteArrayInputStream bais = new ByteArrayInputStream(input)) {
                properties.load(bais);
            }
            for (String key : properties.stringPropertyNames()) {
                systemProps.setProperty(key, properties.getProperty(key));
            }
        } catch (IOException e) {
            throw new RuntimeException("Configuration not found at " + resourcePath, e);
        }
    }

    private static byte[] readResource(String resourcePath) {
        try (InputStream input = LOA1TokenGenerator.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (input == null) {
                throw new RuntimeException("Resource not found: " + resourcePath);
            }
            return input.readAllBytes();
        } catch (IOException e) {
            throw new RuntimeException("Resource not found: " + resourcePath, e);
        }
    }

    private static Properties readPropertyFile(String path) {
        try {
            byte[] input = readResource(path);
            Properties props = new Properties();
            try (ByteArrayInputStream bais = new ByteArrayInputStream(input)) {
                props.load(bais);
            }
            return props;
        } catch (IOException e) {
            throw new RuntimeException("Configuration not found at " + path, e);
        }
    }

    @SuppressWarnings("unchecked")
    private static HashMap<String, String> objectToMap(Object object) {
        ObjectMapper mapper = new ObjectMapper();
        return mapper.convertValue(object, HashMap.class);
    }

    // ───────────────────────── Response models ─────────────────────────

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class IdTokenResponse {
        public String loaToken;
        public int loaTokenLevel;
        public String accountId;
        public String userName;
        public String msisdn;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class HansoloResponse {
        public String mspHansoloToken;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ContentResponse {
        public Items items;

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class Items {
            @JsonProperty("ID_JOURNEYS")
            public IDJourneys iD_JOURNEYS;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class IDJourneys {
            public List<IdJourney> idJourneys;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class IdJourney {
            public Journey journey;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class Journey {
            public String name;
            public String target;
            public Parameters parameters;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        public static class Parameters {
            @JsonProperty("QUERY")
            public QUERY qUERY;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        @JsonInclude(JsonInclude.Include.NON_NULL)
        public static class QUERY {
            public String login_hint;
            public String acr_values;
            public String scope;
            public String response_type;
            public String redirect_uri;
            public String client_id;
            public String prompt;
            public String customerId;
        }
    }
}
