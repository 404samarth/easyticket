package com.easyticket.controller;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class CancellationController {

    private final JdbcTemplate jdbc;

    public CancellationController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping("/api/bookings/{bookingId}/cancel")
    @Transactional
    public Map<String, Object> cancelBooking(
        @PathVariable long bookingId,
        HttpSession session
    ) {
        Object sessionUserId = session.getAttribute("userId");

        if (!(sessionUserId instanceof Number)) {
            throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED, "Please log in to cancel a booking."
            );
        }

        long userId = ((Number) sessionUserId).longValue();

        Map<String, Object> booking;
        try {
            booking = jdbc.queryForMap("""
                SELECT booking_id, inventory_id, passenger_count,
                       total_fare, booking_status, journey_date
                FROM bookings
                WHERE booking_id = ? AND user_id = ?
                FOR UPDATE
                """, bookingId, userId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND, "Booking not found in your account."
            );
        }

        String status = String.valueOf(booking.get("booking_status"));

        if (!"CONFIRMED".equalsIgnoreCase(status)) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT, "Only confirmed bookings can be cancelled."
            );
        }

        LocalDate journeyDate =
            ((java.sql.Date) booking.get("journey_date")).toLocalDate();

        if (!journeyDate.isAfter(LocalDate.now())) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "This booking cannot be cancelled on or after its journey date."
            );
        }

        long inventoryId =
            ((Number) booking.get("inventory_id")).longValue();

        int passengerCount =
            ((Number) booking.get("passenger_count")).intValue();

        Map<String, Object> inventory = jdbc.queryForMap("""
            SELECT total_seats, available_seats
            FROM seat_inventory
            WHERE inventory_id = ?
            FOR UPDATE
            """, inventoryId);

        int totalSeats =
            ((Number) inventory.get("total_seats")).intValue();

        int availableSeats =
            ((Number) inventory.get("available_seats")).intValue();

        if (availableSeats > totalSeats - passengerCount) {
            throw new ResponseStatusException(
                HttpStatus.CONFLICT,
                "Seat inventory validation failed. Cancellation was not applied."
            );
        }

        String cancellationReference = "CAN-" +
            UUID.randomUUID().toString().replace("-", "").substring(0, 20);

        java.math.BigDecimal refundAmount =
            (java.math.BigDecimal) booking.get("total_fare");

        jdbc.update("""
            UPDATE bookings
            SET booking_status = 'CANCELLED'
            WHERE booking_id = ? AND booking_status = 'CONFIRMED'
            """, bookingId);

        jdbc.update("""
            UPDATE passengers
            SET passenger_status = 'CANCELLED'
            WHERE booking_id = ?
            """, bookingId);

        jdbc.update("""
            UPDATE seat_inventory
            SET available_seats = available_seats + ?
            WHERE inventory_id = ?
            """, passengerCount, inventoryId);

        jdbc.update("""
            INSERT INTO cancellations
            (booking_id, cancellation_reference, refund_amount,
             refund_status, cancellation_reason)
            VALUES (?, ?, ?, 'SIMULATED',
                    'Cancelled by the customer. Refund is simulated.')
            """, bookingId, cancellationReference, refundAmount);

        jdbc.update("""
            INSERT INTO booking_status_history
            (booking_id, old_status, new_status, remarks)
            VALUES (?, 'CONFIRMED', 'CANCELLED', ?)
            """, bookingId,
            "Booking cancelled. " + passengerCount +
            " seat(s) released. Simulated refund: " + refundAmount);

        return Map.of(
            "message", "Booking cancelled successfully.",
            "bookingId", bookingId,
            "cancellationReference", cancellationReference,
            "bookingStatus", "CANCELLED",
            "passengerCount", passengerCount,
            "seatsReleased", passengerCount,
            "refundAmount", refundAmount,
            "refundStatus", "SIMULATED",
            "remainingSeats", availableSeats + passengerCount
        );
    }

    @GetMapping("/api/cancellations/history")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCancellationHistory(
        HttpSession session
    ) {
        Object sessionUserId = session.getAttribute("userId");

        if (!(sessionUserId instanceof Number)) {
            throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Please log in to view cancellation history."
            );
        }

        long userId = ((Number) sessionUserId).longValue();

        return jdbc.queryForList("""
            SELECT
                c.cancellation_id AS cancellationId,
                c.cancellation_reference AS cancellationReference,
                c.refund_amount AS refundAmount,
                c.refund_status AS refundStatus,
                c.cancellation_reason AS cancellationReason,
                c.cancelled_at AS cancelledAt,
                b.booking_id AS bookingId,
                b.pnr AS pnr,
                b.train_number AS trainNumber,
                COALESCE(t.train_name, b.train_number) AS trainName,
                b.from_station_code AS fromCode,
                COALESCE(fs.name, b.from_station_code) AS fromName,
                b.to_station_code AS toCode,
                COALESCE(ts.name, b.to_station_code) AS toName,
                b.journey_date AS journeyDate,
                b.travel_class AS travelClass,
                b.passenger_count AS passengerCount
            FROM cancellations c
            JOIN bookings b ON b.booking_id = c.booking_id
            LEFT JOIN trains t ON t.train_number = b.train_number
            LEFT JOIN stations fs ON fs.code = b.from_station_code
            LEFT JOIN stations ts ON ts.code = b.to_station_code
            WHERE b.user_id = ?
            ORDER BY c.cancelled_at DESC, c.cancellation_id DESC
            """, userId);
    }
}
