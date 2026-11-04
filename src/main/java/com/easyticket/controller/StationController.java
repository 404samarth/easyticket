
package com.easyticket.controller;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stations")
public class StationController {

    private final JdbcTemplate jdbcTemplate;

    public StationController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public List<Map<String, Object>> searchStations(
            @RequestParam(defaultValue = "") String query) {

        String search = query.trim();

        if (search.isEmpty()) {
            return List.of();
        }

        String sql = """
            SELECT code, name, state
            FROM stations
            WHERE code LIKE ? OR name LIKE ?
            ORDER BY
                CASE
                    WHEN code = ? THEN 0
                    WHEN name LIKE ? THEN 1
                    ELSE 2
                END,
                name
            LIMIT 15
            """;

        return jdbcTemplate.queryForList(
            sql,
            "%" + search + "%",
            "%" + search + "%",
            search.toUpperCase(),
            search + "%"
        );
    }
}
