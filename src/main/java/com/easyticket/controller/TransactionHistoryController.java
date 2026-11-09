package com.easyticket.controller;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpSession;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/transactions")
public class TransactionHistoryController {

    private final JdbcTemplate jdbc;

    public TransactionHistoryController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/history")
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getTransactionHistory(HttpSession session) {

        Object sessionUserId = session.getAttribute("userId");

        if (!(sessionUserId instanceof Number)) {
            throw new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Please log in to view your transaction history."
            );
        }

        long userId = ((Number) sessionUserId).longValue();

        return jdbc.queryForList("""
            SELECT
                p.payment_id AS paymentId,
                p.transaction_reference AS transactionReference,
                p.amount AS amount,
                p.payment_method AS paymentMethod,
                p.payment_status AS paymentStatus,
                p.paid_at AS paidAt,
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
                b.booking_status AS bookingStatus
            FROM payments p
            INNER JOIN bookings b
                ON b.booking_id = p.booking_id
            LEFT JOIN trains t
                ON t.train_number = b.train_number
            LEFT JOIN stations fs
                ON fs.code = b.from_station_code
            LEFT JOIN stations ts
                ON ts.code = b.to_station_code
            WHERE b.user_id = ?
            ORDER BY p.paid_at DESC, p.payment_id DESC
            """, userId);
    }
}
