package com.mvax.mwtools.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.mvax.mwtools.dto.PipelineHistoryEntry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Stream;

/**
 * Persists pipeline run history as JSON files on the local filesystem.
 * Each completed run is saved as {@code data/pipeline-history/{id}.json}.
 */
@Service
public class PipelineHistoryService {

    private static final Logger log = LoggerFactory.getLogger(PipelineHistoryService.class);
    private static final Path HISTORY_DIR = Paths.get("data", "pipeline-history");
    private static final int MAX_HISTORY = 50;

    private final ObjectMapper mapper = new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT);

    public PipelineHistoryService() {
        try {
            Files.createDirectories(HISTORY_DIR);
            log.info("Pipeline history directory: {}", HISTORY_DIR.toAbsolutePath());
        } catch (IOException e) {
            log.error("Failed to create pipeline history directory: {}", e.getMessage());
        }
    }

    /**
     * Save a completed pipeline run to disk.
     */
    public boolean save(PipelineHistoryEntry entry) {
        try {
            Path file = HISTORY_DIR.resolve(entry.id() + ".json");
            mapper.writeValue(file.toFile(), entry);
            log.info("Saved pipeline history: {}", entry.id());
            trimOldEntries();
            return true;
        } catch (IOException e) {
            log.error("Failed to save pipeline history {}: {}", entry.id(), e.getMessage());
            return false;
        }
    }

    /**
     * Load all history entries, sorted by startedAt descending (newest first).
     */
    public List<PipelineHistoryEntry> loadAll() {
        List<PipelineHistoryEntry> entries = new ArrayList<>();
        if (!Files.exists(HISTORY_DIR)) return entries;

        try (Stream<Path> files = Files.list(HISTORY_DIR)) {
            files.filter(p -> p.toString().endsWith(".json"))
                    .forEach(p -> {
                        try {
                            entries.add(mapper.readValue(p.toFile(), PipelineHistoryEntry.class));
                        } catch (IOException e) {
                            log.warn("Failed to read history file {}: {}", p.getFileName(), e.getMessage());
                        }
                    });
        } catch (IOException e) {
            log.error("Failed to list history files: {}", e.getMessage());
        }

        entries.sort((a, b) -> {
            if (a.startedAt() == null || b.startedAt() == null) return 0;
            return b.startedAt().compareTo(a.startedAt());
        });
        return entries;
    }

    /**
     * Load a single history entry by ID.
     */
    public PipelineHistoryEntry load(String id) {
        Path file = HISTORY_DIR.resolve(id + ".json");
        if (!Files.exists(file)) return null;
        try {
            return mapper.readValue(file.toFile(), PipelineHistoryEntry.class);
        } catch (IOException e) {
            log.error("Failed to read history {}: {}", id, e.getMessage());
            return null;
        }
    }

    /**
     * Delete a single history entry.
     */
    public boolean delete(String id) {
        try {
            return Files.deleteIfExists(HISTORY_DIR.resolve(id + ".json"));
        } catch (IOException e) {
            log.error("Failed to delete history {}: {}", id, e.getMessage());
            return false;
        }
    }

    /**
     * Delete all history entries.
     */
    public int deleteAll() {
        int count = 0;
        try (Stream<Path> files = Files.list(HISTORY_DIR)) {
            for (Path p : files.filter(p -> p.toString().endsWith(".json")).toList()) {
                try {
                    Files.delete(p);
                    count++;
                } catch (IOException e) {
                    log.warn("Failed to delete {}: {}", p.getFileName(), e.getMessage());
                }
            }
        } catch (IOException e) {
            log.error("Failed to list history files for deletion: {}", e.getMessage());
        }
        return count;
    }

    /**
     * Keep only the newest MAX_HISTORY entries.
     */
    private void trimOldEntries() {
        List<PipelineHistoryEntry> all = loadAll();
        if (all.size() <= MAX_HISTORY) return;
        for (int i = MAX_HISTORY; i < all.size(); i++) {
            delete(all.get(i).id());
        }
    }
}
