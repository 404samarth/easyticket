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
@RequestMapping("/api/auth")
public class AuthController {

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder passwordEncoder =
            new BCryptPasswordEncoder();

    public AuthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record RegisterRequest(
            String fullName,
            String email,
            String phone,
            String password
    ) {}

    public record LoginRequest(
            String email,
            String password
    ) {}

    @PostMapping("/register")
    public ResponseEntity<?> register(
            @RequestBody RegisterRequest request,
            HttpSession session) {

        if (request.fullName() == null ||
            request.email() == null ||
            request.phone() == null ||
            request.password() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Please fill in all fields."));
        }

        String name = request.fullName().trim();
        String email = request.email().trim().toLowerCase();
        String phone = request.phone().trim();
        String password = request.password();

        if (name.length() < 2 || name.length() > 120) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Enter a valid full name."));
        }

        if (!Pattern.matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$", email)) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Enter a valid email address."));
        }

        if (!phone.matches("^[0-9]{10,15}$")) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Enter a valid phone number (10–15 digits)."));
        }

        if (password.length() < 8 || password.length() > 72) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Password must contain 8–72 characters."));
        }

        try {
            String hash = passwordEncoder.encode(password);

            jdbc.update("""
                INSERT INTO users (full_name, email, phone, password_hash)
                VALUES (?, ?, ?, ?)
                """, name, email, phone, hash);

            Long userId = jdbc.queryForObject(
                    "SELECT user_id FROM users WHERE email = ?",
                    Long.class, email);

            session.setAttribute("userId", userId);
            session.setAttribute("userName", name);

            return ResponseEntity.status(HttpStatus.CREATED).body(
                    Map.of(
                            "message", "Account created successfully.",
                            "userId", userId,
                            "fullName", name,
                            "email", email
                    )
            );

        } catch (DuplicateKeyException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("message",
                            "This email address or phone number is already registered."));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @RequestBody LoginRequest request,
            HttpSession session) {

        if (request.email() == null || request.password() == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("message", "Email and password are required."));
        }

        String email = request.email().trim().toLowerCase();

        var users = jdbc.queryForList("""
            SELECT user_id, full_name, email, password_hash
            FROM users
            WHERE email = ?
            """, email);

        if (users.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password."));
        }

        Map<String, Object> user = users.get(0);
        String storedHash = (String) user.get("password_hash");

        if (!passwordEncoder.matches(request.password(), storedHash)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password."));
        }

        session.setAttribute("userId", user.get("user_id"));
        session.setAttribute("userName", user.get("full_name"));

        return ResponseEntity.ok(Map.of(
                "message", "Login successful.",
                "userId", user.get("user_id"),
                "fullName", user.get("full_name"),
                "email", user.get("email")
        ));
    }

    @GetMapping("/me")
    public ResponseEntity<?> currentUser(HttpSession session) {
        Object userId = session.getAttribute("userId");

        if (userId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Please log in."));
        }

        return ResponseEntity.ok(Map.of(
                "userId", userId,
                "fullName", session.getAttribute("userName")
        ));
    }

    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpSession session) {
        session.invalidate();
        return ResponseEntity.ok(
                Map.of("message", "Logged out successfully."));
    }
}
