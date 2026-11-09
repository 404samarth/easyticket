package com.easyticket.controller;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.dao.EmptyResultDataAccessException;

@RestController
@RequestMapping("/api/inventory")
public class InventoryController {

    private final JdbcTemplate jdbc;

    private static final Map<String, Integer> SEATS = Map.of(
        "SL", 120, "3A", 64, "2A", 32, "1A", 18,
        "3E", 80, "CC", 80, "EC", 24, "2S", 180
    );

    private static final Map<String, BigDecimal> RATES = Map.of(
        "SL", new BigDecimal("0.55"),
        "3A", new BigDecimal("1.35"),
        "2A", new BigDecimal("1.90"),
        "1A", new BigDecimal("3.20"),
        "3E", new BigDecimal("1.10"),
        "CC", new BigDecimal("1.00"),
        "EC", new BigDecimal("2.20"),
        "2S", new BigDecimal("0.30")
    );


    private static final Map<String, BigDecimal> MIN_FARES = Map.of(
        "2S", new BigDecimal("30.00"),
        "SL", new BigDecimal("50.00"),
        "CC", new BigDecimal("80.00"),
        "3E", new BigDecimal("100.00"),
        "3A", new BigDecimal("150.00"),
        "EC", new BigDecimal("150.00"),
        "2A", new BigDecimal("200.00"),
        "1A", new BigDecimal("300.00")
    );

    private static final Set<String> QUOTAS =
        Set.of("GENERAL", "TATKAL", "PREMIUM_TATKAL");

    public InventoryController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> availability(
        @RequestParam String trainNumber,
        @RequestParam String from,
        @RequestParam String to,
        @RequestParam String date,
        @RequestParam String travelClass,
        @RequestParam(defaultValue = "GENERAL") String quota
    ) {
        LocalDate boardingDate;
        try {
            boardingDate = LocalDate.parse(date);
        } catch (Exception e) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Invalid date. Use YYYY-MM-DD."
            );
        }

        String cls = travelClass.toUpperCase();
        String q = quota.toUpperCase();
        String origin = from.toUpperCase();
        String destination = to.toUpperCase();

        if (!SEATS.containsKey(cls)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Unsupported travel class."
            );
        }

        if (!QUOTAS.contains(q)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Unsupported quota."
            );
        }

        String routeSql = """
            SELECT s.journey_day AS startDay,
                   s.distance_km AS startDistance,
                   e.distance_km AS endDistance,
                   s.sequence_no AS startSequence,
                   e.sequence_no AS endSequence,
                   (SELECT MIN(sequence_no) FROM train_stops
                    WHERE train_number = t.train_number) AS firstSequence,
                   (SELECT MAX(sequence_no) FROM train_stops
                    WHERE train_number = t.train_number) AS lastSequence,
                   t.overall_distance_km AS totalDistance
            FROM trains t
            JOIN train_stops s ON s.train_number = t.train_number
            JOIN train_stops e ON e.train_number = t.train_number
            WHERE t.train_number = ?
              AND s.station_code = ?
              AND e.station_code = ?
              AND s.sequence_no < e.sequence_no
            LIMIT 1
            """;

        Map<String, Object> route;
        try {
            route = jdbc.queryForMap(
                routeSql, trainNumber, origin, destination
            );
        } catch (EmptyResultDataAccessException e) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Train or route segment not found."
            );
        }

        int startDay = route.get("startDay") == null ? 1 :
            ((Number) route.get("startDay")).intValue();

        double startDistance = route.get("startDistance") == null ? 0 :
            ((Number) route.get("startDistance")).doubleValue();

        double endDistance = route.get("endDistance") == null ? 0 :
            ((Number) route.get("endDistance")).doubleValue();

        double totalDistance = route.get("totalDistance") == null ? 0 :
            ((Number) route.get("totalDistance")).doubleValue();

        int startSequence =
            ((Number) route.get("startSequence")).intValue();
        int endSequence =
            ((Number) route.get("endSequence")).intValue();
        int firstSequence =
            ((Number) route.get("firstSequence")).intValue();
        int lastSequence =
            ((Number) route.get("lastSequence")).intValue();

        if (totalDistance <= 0 || lastSequence <= firstSequence) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Route distance data unavailable."
            );
        }

        double segmentDistance = endDistance - startDistance;
        boolean estimatedFare = segmentDistance <= 0;

        if (estimatedFare) {
            double routeIntervals = lastSequence - firstSequence;
            double segmentIntervals = endSequence - startSequence;

            segmentDistance =
                totalDistance * segmentIntervals / routeIntervals;
        }

        // Convert passenger boarding date into train's original
        // departure date, accounting for multi-day routes.
        LocalDate departureDate = boardingDate.minusDays(startDay - 1L);

        int totalSeats = SEATS.get(cls);

        if (q.equals("TATKAL")) {
            totalSeats = Math.max(5, (int) (totalSeats * 0.15));
        } else if (q.equals("PREMIUM_TATKAL")) {
            totalSeats = Math.max(3, (int) (totalSeats * 0.08));
        }

        BigDecimal fullFare = RATES.get(cls)
            .multiply(BigDecimal.valueOf(totalDistance))
            .setScale(2, RoundingMode.HALF_UP);

        if (q.equals("TATKAL")) {
            fullFare = fullFare.multiply(new BigDecimal("1.10"));
        } else if (q.equals("PREMIUM_TATKAL")) {
            fullFare = fullFare.multiply(new BigDecimal("1.30"));
        }

        fullFare = fullFare.setScale(2, RoundingMode.HALF_UP);

        BigDecimal segmentFare = fullFare
            .multiply(BigDecimal.valueOf(segmentDistance))
            .divide(BigDecimal.valueOf(totalDistance), 2, RoundingMode.HALF_UP);

        segmentFare = segmentFare.max(MIN_FARES.get(cls));

        // INSERT IGNORE preserves existing inventory and booked seats.
        jdbc.update("""
            INSERT IGNORE INTO seat_inventory
            (train_number, journey_date, travel_class, quota,
             total_seats, available_seats, fare_per_passenger)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            trainNumber, java.sql.Date.valueOf(departureDate),
            cls, q, totalSeats, totalSeats, fullFare
        );

        Map<String, Object> inventory = jdbc.queryForMap("""
            SELECT inventory_id, total_seats, available_seats
            FROM seat_inventory
            WHERE train_number = ?
              AND journey_date = ?
              AND travel_class = ?
              AND quota = ?
            """,
            trainNumber, java.sql.Date.valueOf(departureDate), cls, q
        );

        return Map.ofEntries(
            Map.entry("trainNumber", trainNumber),
            Map.entry("from", origin),
            Map.entry("to", destination),
            Map.entry("boardingDate", boardingDate.toString()),
            Map.entry("trainDepartureDate", departureDate.toString()),
            Map.entry("travelClass", cls),
            Map.entry("quota", q),
            Map.entry("inventoryId", inventory.get("inventory_id")),
            Map.entry("totalSeats", inventory.get("total_seats")),
            Map.entry("availableSeats", inventory.get("available_seats")),
            Map.entry("farePerPassenger", segmentFare),
            Map.entry("currency", "INR"),
            Map.entry("fareCalculation",
                estimatedFare ? "ESTIMATED_BY_ROUTE_STOPS" : "DISTANCE_BASED"),
            Map.entry("availabilityType", "SIMULATED")
        );
    }
}
