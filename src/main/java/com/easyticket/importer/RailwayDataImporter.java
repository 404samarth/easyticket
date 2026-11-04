package com.easyticket.importer;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.stream.JsonReader;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

@Component
public class RailwayDataImporter implements CommandLineRunner {

    private final JdbcTemplate jdbc;

    private static final int BATCH_SIZE = 200;

    public RailwayDataImporter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) throws Exception {
        Integer imported = jdbc.queryForObject(
            "SELECT COUNT(*) FROM railway_import_status WHERE dataset_name = ?",
            Integer.class,
            "indian-railway-data"
        );

        if (imported != null && imported > 0) {
            System.out.println("Railway dataset already imported. Skipping import.");
            return;
        }

        System.out.println("Preparing railway database...");

        jdbc.update("DELETE FROM train_stops");
        jdbc.update("DELETE FROM trains");
        jdbc.update("DELETE FROM stations");

        importStations();
        importTrains();

        jdbc.update(
            "INSERT INTO railway_import_status(dataset_name) VALUES (?)",
            "indian-railway-data"
        );

        Integer stationCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM stations", Integer.class);
        Integer trainCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM trains", Integer.class);
        Integer stopCount = jdbc.queryForObject(
            "SELECT COUNT(*) FROM train_stops", Integer.class);

        System.out.println("========== IMPORT COMPLETE ==========");
        System.out.println("Stations: " + stationCount);
        System.out.println("Trains: " + trainCount);
        System.out.println("Route stops: " + stopCount);
    }

    private void importStations() throws Exception {
        System.out.println("Importing stations...");

        String sql = """
            INSERT INTO stations
            (code, name, state, zone, address, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """;

        List<Object[]> batch = new ArrayList<>();

        try (JsonReader reader = new JsonReader(
                new FileReader("data/source/stations.json"))) {
            reader.beginArray();

            while (reader.hasNext()) {
                JsonObject s = JsonParser.parseReader(reader).getAsJsonObject();
                JsonObject coordinates = object(s, "coordinates");

                batch.add(new Object[]{
                    str(s, "code"),
                    str(s, "name"),
                    str(s, "state"),
                    str(s, "zone"),
                    str(s, "address"),
                    number(coordinates, "latitude"),
                    number(coordinates, "longitude")
                });

                if (batch.size() >= 1000) {
                    jdbc.batchUpdate(sql, batch);
                    batch.clear();
                }
            }
        }

        if (!batch.isEmpty()) {
            jdbc.batchUpdate(sql, batch);
        }
    }

    private void importTrains() throws Exception {
        System.out.println("Importing trains and complete routes...");

        String trainSql = """
            INSERT INTO trains
            (train_number, train_name, train_type, source_code, source_name,
             destination_code, destination_name, running_days, overall_distance_km)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """;

        String stopSql = """
            INSERT INTO train_stops
            (train_number, sequence_no, station_code, station_name,
             arrival_time, departure_time, journey_day, distance_km)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """;

        List<Object[]> trainBatch = new ArrayList<>();
        List<Object[]> stopBatch = new ArrayList<>();

        try (JsonReader reader = new JsonReader(
                new FileReader("data/source/trains.json"))) {
            reader.beginArray();

            while (reader.hasNext()) {
                JsonObject t = JsonParser.parseReader(reader).getAsJsonObject();
                JsonObject source = object(t, "source");
                JsonObject destination = object(t, "destination");
                JsonObject days = object(t, "runningDays");

                String trainNumber = str(t, "trainNumber");

                trainBatch.add(new Object[]{
                    trainNumber,
                    str(t, "trainName"),
                    str(t, "type"),
                    str(source, "code"),
                    str(source, "name"),
                    str(destination, "code"),
                    str(destination, "name"),
                    days == null ? "{}" : days.toString(),
                    number(t, "overallDistanceKm")
                });

                if (t.has("completeOrderedRoute")
                        && t.get("completeOrderedRoute").isJsonArray()) {
                    for (var stopElement : t.getAsJsonArray("completeOrderedRoute")) {
                        JsonObject stop = stopElement.getAsJsonObject();

                        stopBatch.add(new Object[]{
                            trainNumber,
                            integer(stop, "sequence"),
                            str(stop, "stationCode"),
                            str(stop, "stationName"),
                            str(stop, "arrivalTime"),
                            str(stop, "departureTime"),
                            integer(stop, "journeyDay"),
                            number(stop, "distance")
                        });
                    }
                }

                if (trainBatch.size() >= BATCH_SIZE) {
                    jdbc.batchUpdate(trainSql, trainBatch);
                    trainBatch.clear();

                    jdbc.batchUpdate(stopSql, stopBatch);
                    stopBatch.clear();

                    System.out.println("Imported train batch...");
                }
            }
        }

        if (!trainBatch.isEmpty()) {
            jdbc.batchUpdate(trainSql, trainBatch);
        }

        if (!stopBatch.isEmpty()) {
            jdbc.batchUpdate(stopSql, stopBatch);
        }
    }

    private static JsonObject object(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return null;
        }
        return obj.getAsJsonObject(key);
    }

    private static String str(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return null;
        }
        return obj.get(key).getAsString();
    }

    private static Integer integer(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return null;
        }
        return obj.get(key).getAsInt();
    }

    private static Double number(JsonObject obj, String key) {
        if (obj == null || !obj.has(key) || obj.get(key).isJsonNull()) {
            return null;
        }
        return obj.get(key).getAsDouble();
    }
}
