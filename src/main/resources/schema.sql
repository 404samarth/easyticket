CREATE TABLE IF NOT EXISTS stations (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    state VARCHAR(100),
    zone VARCHAR(20),
    address VARCHAR(500),
    latitude DOUBLE,
    longitude DOUBLE,
    INDEX idx_station_name (name),
    INDEX idx_station_state (state)
);

CREATE TABLE IF NOT EXISTS trains (
    train_number VARCHAR(50) PRIMARY KEY,
    train_name VARCHAR(255) NOT NULL,
    train_type VARCHAR(50),
    source_code VARCHAR(50),
    source_name VARCHAR(255),
    destination_code VARCHAR(50),
    destination_name VARCHAR(255),
    running_days JSON,
    overall_distance_km DOUBLE,
    INDEX idx_train_name (train_name),
    INDEX idx_train_source (source_code),
    INDEX idx_train_destination (destination_code)
);

CREATE TABLE IF NOT EXISTS train_stops (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    train_number VARCHAR(50) NOT NULL,
    sequence_no INT NOT NULL,
    station_code VARCHAR(50),
    station_name VARCHAR(255),
    arrival_time VARCHAR(20),
    departure_time VARCHAR(20),
    journey_day INT,
    distance_km DOUBLE,
    UNIQUE KEY uq_train_sequence (train_number, sequence_no),
    INDEX idx_stop_station (station_code),
    INDEX idx_train_station_sequence (train_number, station_code, sequence_no),
    CONSTRAINT fk_stop_train FOREIGN KEY (train_number)
        REFERENCES trains(train_number) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS railway_import_status (
    dataset_name VARCHAR(100) PRIMARY KEY,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
