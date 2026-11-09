package com.easyticket.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pnr")
public class PnrController {

    private final JdbcTemplate jdbc;

    public PnrController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/{pnr}")
    public ResponseEntity<?> getPnr(@PathVariable String pnr) {

        if (pnr == null || pnr.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Please enter a valid PNR."));
        }

        List<Map<String, Object>> bookings = jdbc.queryForList("""
            SELECT
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
                b.quota AS quota,
                b.passenger_count AS passengerCount,
                b.total_fare AS totalFare,
                b.booking_status AS bookingStatus,
                b.booked_at AS bookedAt
            FROM bookings b
            LEFT JOIN trains t ON t.train_number = b.train_number
            LEFT JOIN stations fs ON fs.code = b.from_station_code
            LEFT JOIN stations ts ON ts.code = b.to_station_code
            WHERE UPPER(b.pnr) = UPPER(?)
            """, pnr.trim());

        if (bookings.isEmpty()) {
            return ResponseEntity.status(404)
                    .body(Map.of("message",
                            "No EasyTicket booking found for this PNR."));
        }

        Map<String, Object> booking = bookings.get(0);
        long bookingId = ((Number) booking.get("bookingId")).longValue();

        List<Map<String, Object>> passengers = jdbc.queryForList("""
            SELECT
                seat_number AS seatNumber,
                passenger_status AS passengerStatus
            FROM passengers
            WHERE booking_id = ?
            ORDER BY passenger_id
            """, bookingId);

        List<Map<String, Object>> statusHistory = jdbc.queryForList("""
            SELECT
                old_status AS oldStatus,
                new_status AS newStatus,
                changed_at AS changedAt
            FROM booking_status_history
            WHERE booking_id = ?
            ORDER BY changed_at ASC, history_id ASC
            """, bookingId);

        booking.remove("bookingId");
        booking.put("passengers", passengers);
        booking.put("statusHistory", statusHistory);

        return ResponseEntity.ok(booking);
    }
}
