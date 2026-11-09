package com.easyticket.controller;

import java.util.Map;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpSession;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/account")
public class AccountController {

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder =
            new BCryptPasswordEncoder();

    public AccountController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record ProfileRequest(
            String fullName,
            String email,
            String phone
    ) {}

    public record ChangePasswordRequest(
            String currentPassword,
            String newPassword
    ) {}

    @GetMapping("/profile")
    public ResponseEntity<?> getProfile(HttpSession session) {
        Object userId = session.getAttribute("userId");

        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Please log in."));
        }

        var users = jdbc.queryForList("""
            SELECT full_name, email, phone
            FROM users
            WHERE user_id = ?
            """, userId);

        if (users.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Account not found."));
        }

        return ResponseEntity.ok(users.get(0));
    }

    @PutMapping("/profile")
    public ResponseEntity<?> updateProfile(
            @RequestBody ProfileRequest request,
            HttpSession session) {

        Object userId = session.getAttribute("userId");

        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Please log in."));
        }

        if (request.fullName() == null ||
            request.email() == null ||
            request.phone() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Please fill in all fields."));
        }

        String name = request.fullName().trim();
        String email = request.email().trim().toLowerCase();
        String phone = request.phone().trim();

        if (name.length() < 2 || name.length() > 120) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Enter a valid full name."));
        }

        if (!Pattern.matches(
                "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$",
                email)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Enter a valid email address."));
        }

        if (!phone.matches("^[0-9]{10,15}$")) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message",
                            "Enter a valid phone number (10–15 digits)."));
        }

        try {
            int updated = jdbc.update("""
                UPDATE users
                SET full_name = ?, email = ?, phone = ?
                WHERE user_id = ?
                """, name, email, phone, userId);

            if (updated == 0) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "Account not found."));
            }

            session.setAttribute("userName", name);

            return ResponseEntity.ok(Map.of(
                    "message", "Account details updated successfully.",
                    "fullName", name,
                    "email", email,
                    "phone", phone
            ));

        } catch (DuplicateKeyException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "This email address or phone number is already registered."));
        }
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(
            @RequestBody ChangePasswordRequest request,
            HttpSession session) {

        Object userId = session.getAttribute("userId");

        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Please log in."));
        }

        if (request.currentPassword() == null ||
            request.newPassword() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Both password fields are required."));
        }

        String newPassword = request.newPassword();

        if (newPassword.length() < 8 || newPassword.length() > 72) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message",
                            "New password must contain 8–72 characters."));
        }

        var users = jdbc.queryForList("""
            SELECT password_hash
            FROM users
            WHERE user_id = ?
            """, userId);

        if (users.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Account not found."));
        }

        String storedHash = (String) users.get(0).get("password_hash");

        if (!passwordEncoder.matches(
                request.currentPassword(), storedHash)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Current password is incorrect."));
        }

        if (passwordEncoder.matches(newPassword, storedHash)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message",
                            "New password must be different from the current password."));
        }

        String newHash = passwordEncoder.encode(newPassword);

        int updated = jdbc.update("""
            UPDATE users
            SET password_hash = ?
            WHERE user_id = ?
            """, newHash, userId);

        if (updated == 0) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(Map.of("message", "Account not found."));
        }

        return ResponseEntity.ok(Map.of(
                "message", "Password changed successfully."
        ));
    }
}
