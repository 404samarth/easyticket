package com.easyticket.controller;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/trains")
public class TrainController {

    private final JdbcTemplate jdbcTemplate;

    public TrainController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/search")
    public List<Map<String, Object>> searchTrains(
            @RequestParam String from,
            @RequestParam String to,
            @RequestParam String date) {

        LocalDate.parse(date);

        String sql = """
            SELECT
                t.train_number AS trainNumber,
                t.train_name AS trainName,
                t.train_type AS trainType,
                t.source_code AS sourceCode,
                t.source_name AS sourceName,
                t.destination_code AS destinationCode,
                t.destination_name AS destinationName,
                start_stop.station_name AS boardingStation,
                end_stop.station_name AS arrivalStation,
                COALESCE(start_stop.departure_time,
                         start_stop.arrival_time) AS departureTime,
                COALESCE(end_stop.arrival_time,
                         end_stop.departure_time) AS arrivalTime,
                start_stop.sequence_no AS startSequence,
                end_stop.sequence_no AS endSequence,
                start_stop.journey_day AS startDay,
                end_stop.journey_day AS endDay,
                start_stop.distance_km AS startDistance,
                end_stop.distance_km AS endDistance
            FROM trains t
            JOIN train_stops start_stop
                ON t.train_number = start_stop.train_number
            JOIN train_stops end_stop
                ON t.train_number = end_stop.train_number
            WHERE
                start_stop.station_code = ?
                AND end_stop.station_code = ?
                AND start_stop.sequence_no < end_stop.sequence_no
                AND JSON_UNQUOTE(
                    JSON_EXTRACT(
                        t.running_days,
                        CONCAT(
                            '$.',
                            CASE DAYOFWEEK(
                                DATE_SUB(
                                    CAST(? AS DATE),
                                    INTERVAL (
                                        COALESCE(start_stop.journey_day, 1) - 1
                                    ) DAY
                                )
                            )
                                WHEN 1 THEN 'SUN'
                                WHEN 2 THEN 'MON'
                                WHEN 3 THEN 'TUE'
                                WHEN 4 THEN 'WED'
                                WHEN 5 THEN 'THU'
                                WHEN 6 THEN 'FRI'
                                WHEN 7 THEN 'SAT'
                            END
                        )
                    )
                ) = 'true'
            ORDER BY departureTime
            """;

        return jdbcTemplate.queryForList(
            sql,
            from.toUpperCase(),
            to.toUpperCase(),
            date
        );
    }

    @GetMapping("/{trainNumber}/schedule")
    public List<Map<String, Object>> getTrainSchedule(
            @PathVariable String trainNumber,
            @RequestParam String from,
            @RequestParam String to) {

        String sql = """
            SELECT
                t.train_number AS trainNumber,
                t.train_name AS trainName,
                t.train_type AS trainType,
                t.source_code AS sourceCode,
                t.source_name AS sourceName,
                t.destination_code AS destinationCode,
                t.destination_name AS destinationName,
                s.sequence_no AS sequenceNumber,
                s.station_code AS stationCode,
                s.station_name AS stationName,
                s.arrival_time AS arrivalTime,
                s.departure_time AS departureTime,
                s.journey_day AS journeyDay,
                s.distance_km AS distanceKm,
                CASE WHEN s.station_code = ? THEN TRUE ELSE FALSE END AS boardingStop,
                CASE WHEN s.station_code = ? THEN TRUE ELSE FALSE END AS alightingStop
            FROM trains t
            JOIN train_stops s
                ON t.train_number = s.train_number
            WHERE t.train_number = ?
            ORDER BY s.sequence_no
            """;

        return jdbcTemplate.queryForList(
            sql,
            from.toUpperCase(),
            to.toUpperCase(),
            trainNumber
        );
    }
}
