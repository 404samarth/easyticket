EASYTICKET REDESIGNED FRONTEND — INSTALLATION

This package is built for the existing EasyTicket Spring Boot + MySQL project.
It uses plain HTML, CSS and JavaScript. No npm, React or separate frontend server is required.

FILES
- src/main/resources/static/index.html
- src/main/resources/static/style.css
- src/main/resources/static/app.js

INSTALL IN YOUR EXISTING GITHUB CODESPACE
1. Upload this ZIP into the root of your existing /workspaces/easyticket repository (the folder containing pom.xml).
2. In the Codespaces terminal, run:
   cd /workspaces/easyticket
   unzip -o easyticket-redesigned-frontend.zip -d .
3. This replaces only the three static frontend files. It does NOT replace Java controllers, database schema, .env, Docker data, or railway data.
4. Check Java compilation:
   ./mvnw -DskipTests compile
5. Start the MySQL container if needed:
   docker compose up -d
6. Start Spring Boot using the existing .env:
   set -a
   source .env
   set +a
   export DB_USERNAME=easyticket_user
   ./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=8081
7. Open port 8081 in the Codespaces PORTS tab.

FEATURES CONNECTED TO EXISTING APIs
- Station autocomplete: GET /api/stations
- Train search: GET /api/trains/search
- Full train route: GET /api/trains/{trainNumber}/schedule
- Simulated class inventory and fare: GET /api/inventory
- Login/register/session/logout: /api/auth/*
- Booking creation: POST /api/bookings
- PNR ticket confirmation and browser printing

IMPORTANT PROJECT LIMITATIONS
- Availability, fares and payment are simulated, not official live IRCTC services.
- Senior Citizen category currently uses GENERAL inventory because the supplied backend has no senior-citizen quota or concession calculation. No concession is applied.
- Booking history, PNR lookup, cancellation/refund, admin train management and manual booking endpoints are not present in the current backend. The frontend does not pretend these work.
- The booking endpoint accepts up to 6 passengers and class codes SL, 3A, CC, 2A, 1A, 3E are used here.
- Do not delete or re-import the MySQL database. Never run docker compose down -v.
