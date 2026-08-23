package com.mva.mwtool.service.pipeline.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;

import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class PipelineVariableResolver {

    private static final Pattern VARIABLE_PATTERN = Pattern.compile("\\$\\{([A-Za-z_][A-Za-z0-9_]*)}");

    private PipelineVariableResolver() {
    }

    public static JsonNode resolve(JsonNode pipelineStructure, Map<String, String> overrides) {
        if (pipelineStructure == null || pipelineStructure.isNull()) {
            throw new IllegalArgumentException("Pipeline structure is required");
        }
        if (!(pipelineStructure instanceof ObjectNode rootNode)) {
            throw new IllegalArgumentException("Pipeline structure must be a JSON object");
        }

        ObjectNode resolved = rootNode.deepCopy();
        Map<String, String> values = collectValues(rootNode.path("variables"), overrides);

        resolveNode(resolved, values, true);
        resolved.set("resolvedVariables", resolved.objectNode().setAll(toObjectNode(resolved, values)));
        return resolved;
    }

    private static Map<String, String> collectValues(JsonNode variablesNode, Map<String, String> overrides) {
        Map<String, String> values = new LinkedHashMap<>();
        Set<String> seen = new HashSet<>();

        if (variablesNode == null || variablesNode.isMissingNode() || variablesNode.isNull()) {
            return values;
        }

        if (!variablesNode.isArray()) {
            throw new IllegalArgumentException("Pipeline variables must be an array");
        }

        for (JsonNode variableNode : variablesNode) {
            String name = variableNode.path("name").asText("").trim();
            if (name.isEmpty()) {
                throw new IllegalArgumentException("Pipeline variable name is required");
            }
            if (!seen.add(name)) {
                throw new IllegalArgumentException("Duplicate pipeline variable: " + name);
            }

            String defaultValue = variableNode.path("defaultValue").asText("");
            boolean required = variableNode.path("required").asBoolean(false);
            boolean overrideProvided = overrides != null && overrides.containsKey(name);
            String resolvedValue = overrideProvided ? nullToEmpty(overrides.get(name)) : defaultValue;

            if (required && resolvedValue.isBlank()) {
                throw new IllegalArgumentException("Missing required pipeline variable: " + name);
            }

            values.put(name, resolvedValue);
        }

        return values;
    }

    private static ObjectNode toObjectNode(ObjectNode resolved, Map<String, String> values) {
        ObjectNode variablesNode = resolved.objectNode();
        for (Entry<String, String> entry : values.entrySet()) {
            variablesNode.put(entry.getKey(), entry.getValue());
        }
        return variablesNode;
    }

    private static void resolveNode(JsonNode current, Map<String, String> values, boolean rootLevel) {
        if (current instanceof ObjectNode objectNode) {
            Iterator<Entry<String, JsonNode>> fields = objectNode.fields();
            while (fields.hasNext()) {
                Entry<String, JsonNode> field = fields.next();
                if (rootLevel && ("variables".equals(field.getKey()) || "resolvedVariables".equals(field.getKey()))) {
                    continue;
                }

                JsonNode child = field.getValue();
                if (child instanceof TextNode textNode) {
                    objectNode.set(field.getKey(), TextNode.valueOf(resolveString(textNode.textValue(), values)));
                    continue;
                }

                resolveNode(child, values, false);
            }
            return;
        }

        if (current instanceof ArrayNode arrayNode) {
            for (int i = 0; i < arrayNode.size(); i++) {
                JsonNode item = arrayNode.get(i);
                if (item instanceof TextNode textNode) {
                    arrayNode.set(i, TextNode.valueOf(resolveString(textNode.textValue(), values)));
                    continue;
                }
                resolveNode(item, values, false);
            }
        }
    }

    private static String resolveString(String input, Map<String, String> values) {
        Matcher matcher = VARIABLE_PATTERN.matcher(input);
        StringBuffer buffer = new StringBuffer();

        while (matcher.find()) {
            String variableName = matcher.group(1);
            if (!values.containsKey(variableName)) {
                throw new IllegalArgumentException("Unknown pipeline variable: " + variableName);
            }

            matcher.appendReplacement(buffer, Matcher.quoteReplacement(values.get(variableName)));
        }

        matcher.appendTail(buffer);
        return buffer.toString();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}