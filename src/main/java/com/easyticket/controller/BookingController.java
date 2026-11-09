package com.easyticket.controller;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {

    private final JdbcTemplate jdbc;
    private final SecureRandom random = new SecureRandom();

    private static final Set<String> CLASSES =
        Set.of("SL", "3A", "2A", "1A", "3E", "CC", "EC", "2S");

    private static final Set<String> QUOTAS =
        Set.of("GENERAL", "TATKAL", "PREMIUM_TATKAL");


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

    private static final Set<String> PAYMENT_METHODS =
        Set.of("UPI", "CARD", "NETBANKING", "DEMO");

    public BookingController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record PassengerRequest(
        String name,
        Integer age,
        String gender,
        String berthPreference
    ) {}

    public record BookingRequest(
        String trainNumber,
        String from,
        String to,
        String journeyDate,
        String travelClass,
        String quota,
        String paymentMethod,
        List<PassengerRequest> passengers
    ) {}

    @PostMapping
    @Transactional
    public Map<String, Object> createBooking(
        @RequestBody BookingRequest request,
        HttpSession session
    ) {
        Object sessionUserId = session.getAttribute("userId");

        if (!(sessionUserId instanceof Number)) {
            throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Please log in before booking."
            );
        }

        long userId = ((Number) sessionUserId).longValue();

        if (request.trainNumber() == null ||
            request.from() == null ||
            request.to() == null ||
            request.journeyDate() == null ||
            request.travelClass() == null ||
            request.quota() == null ||
            request.passengers() == null ||
            request.passengers().isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Please provide all booking details."
            );
        }

        if (request.passengers().size() > 6) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Maximum 6 passengers per booking."
            );
        }

        LocalDate boardingDate;
        try {
            boardingDate = LocalDate.parse(request.journeyDate());
        } catch (Exception ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Invalid journey date. Use YYYY-MM-DD."
            );
        }

        if (boardingDate.isBefore(LocalDate.now())) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Journey date cannot be in the past."
            );
        }

        String train = request.trainNumber().trim();
        String from = request.from().trim().toUpperCase();
        String to = request.to().trim().toUpperCase();
        String cls = request.travelClass().trim().toUpperCase();
        String quota = request.quota().trim().toUpperCase();
        String paymentMethod = request.paymentMethod() == null
            ? "DEMO" : request.paymentMethod().trim().toUpperCase();

        if (!CLASSES.contains(cls) || !QUOTAS.contains(quota)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Invalid class or quota."
            );
        }

        if (!PAYMENT_METHODS.contains(paymentMethod)) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Unsupported simulated payment method."
            );
        }

        for (PassengerRequest passenger : request.passengers()) {
            if (passenger == null ||
                passenger.name() == null ||
                passenger.name().trim().length() < 2 ||
                passenger.name().trim().length() > 120 ||
                passenger.age() == null ||
                passenger.age() < 0 ||
                passenger.age() > 120 ||
                passenger.gender() == null ||
                !Set.of("MALE", "FEMALE", "OTHER")
                    .contains(passenger.gender().trim().toUpperCase())) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid passenger details."
                );
            }
        }

        Map<String, Object> route;
        try {
            route = jdbc.queryForMap("""
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
                """, train, from, to);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Train or journey route not found."
            );
        }

        int startDay = ((Number) route.get("startDay")).intValue();
        int startSequence = ((Number) route.get("startSequence")).intValue();
        int endSequence = ((Number) route.get("endSequence")).intValue();
        int firstSequence = ((Number) route.get("firstSequence")).intValue();
        int lastSequence = ((Number) route.get("lastSequence")).intValue();

        LocalDate trainDepartureDate =
            boardingDate.minusDays(startDay - 1L);

        Map<String, Object> inventory;
        try {
            inventory = jdbc.queryForMap("""
                SELECT inventory_id, available_seats, fare_per_passenger
                FROM seat_inventory
                WHERE train_number = ?
                  AND journey_date = ?
                  AND travel_class = ?
                  AND quota = ?
                FOR UPDATE
                """,
                train, java.sql.Date.valueOf(trainDepartureDate), cls, quota
            );
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Seat inventory not found. Check availability before booking."
            );
        }

        int availableSeats =
            ((Number) inventory.get("available_seats")).intValue();

        int passengerCount = request.passengers().size();

        if (availableSeats < passengerCount) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Not enough seats available. Available seats: " + availableSeats
            );
        }

        double totalDistance =
            ((Number) route.get("totalDistance")).doubleValue();

        double startDistance =
            ((Number) route.get("startDistance")).doubleValue();

        double endDistance =
            ((Number) route.get("endDistance")).doubleValue();

        double segmentDistance = endDistance - startDistance;

        if (totalDistance <= 0 || lastSequence <= firstSequence) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST, "Unable to calculate journey fare."
            );
        }

        if (segmentDistance <= 0) {
            segmentDistance = totalDistance *
                (endSequence - startSequence) /
                (lastSequence - firstSequence);
        }

        BigDecimal fullFare =
            (BigDecimal) inventory.get("fare_per_passenger");

        BigDecimal farePerPassenger = fullFare
            .multiply(BigDecimal.valueOf(segmentDistance))
            .divide(BigDecimal.valueOf(totalDistance), 2, RoundingMode.HALF_UP);

        farePerPassenger = farePerPassenger.max(MIN_FARES.get(cls));

        BigDecimal totalFare =
            farePerPassenger.multiply(BigDecimal.valueOf(passengerCount));

        String pnr = generatePnr();
        String transactionReference = "SIM-" +
            UUID.randomUUID().toString().replace("-", "").substring(0, 20);

        KeyHolder bookingKey = new GeneratedKeyHolder();

        jdbc.update(connection -> {
            var ps = connection.prepareStatement("""
                INSERT INTO bookings
                (pnr, user_id, inventory_id, train_number,
                 from_station_code, to_station_code, journey_date,
                 travel_class, quota, passenger_count, total_fare,
                 booking_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED')
                """, Statement.RETURN_GENERATED_KEYS);

            ps.setString(1, pnr);
            ps.setLong(2, userId);
            ps.setLong(3, ((Number) inventory.get("inventory_id")).longValue());
            ps.setString(4, train);
            ps.setString(5, from);
            ps.setString(6, to);
            ps.setDate(7, java.sql.Date.valueOf(boardingDate));
            ps.setString(8, cls);
            ps.setString(9, quota);
            ps.setInt(10, passengerCount);
            ps.setBigDecimal(11, totalFare);
            return ps;
        }, bookingKey);

        if (bookingKey.getKey() == null) {
            throw new IllegalStateException("Booking ID was not generated.");
        }

        long bookingId = bookingKey.getKey().longValue();

        for (PassengerRequest passenger : request.passengers()) {
            String preference = passenger.berthPreference() == null ||
                passenger.berthPreference().isBlank()
                ? "NO_PREFERENCE"
                : passenger.berthPreference().trim().toUpperCase();

            jdbc.update("""
                INSERT INTO passengers
                (booking_id, passenger_name, age, gender,
                 berth_preference, passenger_status)
                VALUES (?, ?, ?, ?, ?, 'CONFIRMED')
                """,
                bookingId,
                passenger.name().trim(),
                passenger.age(),
                passenger.gender().trim().toUpperCase(),
                preference
            );
        }

        jdbc.update("""
            INSERT INTO payments
            (booking_id, transaction_reference, amount,
             payment_method, payment_status)
            VALUES (?, ?, ?, ?, 'SUCCESS')
            """,
            bookingId, transactionReference, totalFare, paymentMethod
        );

        jdbc.update("""
            INSERT INTO booking_status_history
            (booking_id, old_status, new_status, remarks)
            VALUES (?, NULL, 'CONFIRMED', ?)
            """,
            bookingId, "Educational simulation payment successful."
        );

        int updated = jdbc.update("""
            UPDATE seat_inventory
            SET available_seats = available_seats - ?
            WHERE inventory_id = ?
              AND available_seats >= ?
            """,
            passengerCount,
            inventory.get("inventory_id"),
            passengerCount
        );

        if (updated != 1) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "Seat allocation failed. Please try again."
            );
        }

        return Map.ofEntries(
            Map.entry("message", "Booking confirmed successfully."),
            Map.entry("bookingId", bookingId),
            Map.entry("pnr", pnr),
            Map.entry("trainNumber", train),
            Map.entry("from", from),
            Map.entry("to", to),
            Map.entry("journeyDate", boardingDate.toString()),
            Map.entry("travelClass", cls),
            Map.entry("quota", quota),
            Map.entry("passengerCount", passengerCount),
            Map.entry("farePerPassenger", farePerPassenger),
            Map.entry("totalFare", totalFare),
            Map.entry("paymentStatus", "SUCCESS"),
            Map.entry("paymentType", "SIMULATED"),
            Map.entry("bookingStatus", "CONFIRMED"),
            Map.entry("remainingSeats", availableSeats - passengerCount)
        );
    }

    private String generatePnr() {
        StringBuilder pnr = new StringBuilder();
        for (int i = 0; i < 10; i++) {
            pnr.append(random.nextInt(10));
        }
        return pnr.toString();
    }
}
