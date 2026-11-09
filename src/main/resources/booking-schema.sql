
CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS seat_inventory (
    inventory_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    train_number VARCHAR(50) NOT NULL,
    journey_date DATE NOT NULL,
    travel_class VARCHAR(10) NOT NULL,
    quota VARCHAR(30) NOT NULL,
    total_seats INT NOT NULL,
    available_seats INT NOT NULL,
    fare_per_passenger DECIMAL(10,2) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_inventory_train
        FOREIGN KEY (train_number)
        REFERENCES trains(train_number),

    CONSTRAINT uq_train_inventory
        UNIQUE (train_number, journey_date, travel_class, quota),

    CONSTRAINT chk_total_seats
        CHECK (total_seats >= 0),

    CONSTRAINT chk_available_seats
        CHECK (available_seats >= 0 AND available_seats <= total_seats),

    CONSTRAINT chk_inventory_fare
        CHECK (fare_per_passenger >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
    booking_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    pnr VARCHAR(20) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL,
    inventory_id BIGINT NOT NULL,
    train_number VARCHAR(50) NOT NULL,
    from_station_code VARCHAR(50) NOT NULL,
    to_station_code VARCHAR(50) NOT NULL,
    journey_date DATE NOT NULL,
    travel_class VARCHAR(10) NOT NULL,
    quota VARCHAR(30) NOT NULL,
    passenger_count INT NOT NULL,
    total_fare DECIMAL(12,2) NOT NULL,
    booking_status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED',
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_booking_user
        FOREIGN KEY (user_id) REFERENCES users(user_id),

    CONSTRAINT fk_booking_inventory
        FOREIGN KEY (inventory_id) REFERENCES seat_inventory(inventory_id),

    CONSTRAINT fk_booking_train
        FOREIGN KEY (train_number) REFERENCES trains(train_number),

    CONSTRAINT fk_booking_from_station
        FOREIGN KEY (from_station_code) REFERENCES stations(code),

    CONSTRAINT fk_booking_to_station
        FOREIGN KEY (to_station_code) REFERENCES stations(code),

    CONSTRAINT chk_passenger_count
        CHECK (passenger_count > 0),

    CONSTRAINT chk_booking_fare
        CHECK (total_fare >= 0),

    INDEX idx_booking_user (user_id),
    INDEX idx_booking_date (journey_date),
    INDEX idx_booking_train (train_number)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS passengers (
    passenger_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT NOT NULL,
    passenger_name VARCHAR(120) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(20) NOT NULL,
    berth_preference VARCHAR(30) DEFAULT 'NO_PREFERENCE',
    seat_number VARCHAR(20),
    passenger_status VARCHAR(30) DEFAULT 'CONFIRMED',

    CONSTRAINT fk_passenger_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id) ON DELETE CASCADE,

    CONSTRAINT chk_passenger_age
        CHECK (age BETWEEN 0 AND 120),

    INDEX idx_passenger_booking (booking_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
    payment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT NOT NULL,
    transaction_reference VARCHAR(80) NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL,
    payment_method VARCHAR(40) NOT NULL,
    payment_status VARCHAR(30) NOT NULL,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_payment_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id),

    CONSTRAINT chk_payment_amount
        CHECK (amount >= 0),

    INDEX idx_payment_booking (booking_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS booking_status_history (
    history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    booking_id BIGINT NOT NULL,
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    remarks VARCHAR(500),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_history_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id),

    INDEX idx_history_booking (booking_id)
) ENGINE=InnoDB;

