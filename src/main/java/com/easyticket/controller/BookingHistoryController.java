package com.easyticket.controller;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/bookings")
public class BookingHistoryController {

    private final JdbcTemplate jdbc;

    public BookingHistoryController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/history")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getBookingHistory(HttpSession session) {

        Object sessionUserId = session.getAttribute("userId");

        if (!(sessionUserId instanceof Number)) {
            throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Please log in to view your booking history."
            );
        }

        long userId = ((Number) sessionUserId).longValue();

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
                b.booked_at AS bookedAt,
                p.transaction_reference AS transactionReference,
                p.payment_method AS paymentMethod,
                p.payment_status AS paymentStatus,
                p.paid_at AS paidAt,
                p.amount AS paidAmount
            FROM bookings b
            LEFT JOIN trains t
                ON t.train_number = b.train_number
            LEFT JOIN stations fs
                ON fs.code = b.from_station_code
            LEFT JOIN stations ts
                ON ts.code = b.to_station_code
            LEFT JOIN payments p
                ON p.booking_id = b.booking_id
            WHERE b.user_id = ?
            ORDER BY b.booked_at DESC, b.booking_id DESC
            """, userId);

        for (Map<String, Object> booking : bookings) {

            long bookingId =
                ((Number) booking.get("bookingId")).longValue();

            List<Map<String, Object>> passengers = jdbc.queryForList("""
                SELECT
                    passenger_id AS passengerId,
                    passenger_name AS passengerName,
                    age,
                    gender,
                    berth_preference AS berthPreference,
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
                    remarks,
                    changed_at AS changedAt
                FROM booking_status_history
                WHERE booking_id = ?
                ORDER BY changed_at ASC, history_id ASC
                """, bookingId);

            booking.put("passengers", passengers);
            booking.put("statusHistory", statusHistory);
        }

        return bookings;
    }
}
