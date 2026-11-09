EASYTICKET FRONTEND — INSTALLATION IN GITHUB CODESPACES

This package is designed for the existing EasyTicket Spring Boot + MySQL project.
It uses plain HTML, CSS and JavaScript. No React, npm, Node.js or separate frontend server is required.

FILES IN THIS PACKAGE
- src/main/resources/static/index.html
- src/main/resources/static/style.css
- src/main/resources/static/app.js
- src/main/java/com/easyticket/controller/TrainController.java

INSTALL
1. Upload this ZIP into the root of your existing GitHub Codespace repository (the same folder that contains pom.xml).
2. Open the Codespaces terminal and run:
   unzip -o easyticket-frontend-package.zip -d .
   (Use the actual uploaded ZIP filename if you renamed it.)
3. The ZIP contains a corrected TrainController.java. It places the full schedule endpoint inside the controller class. It replaces only that Java controller file and adds the static frontend files.
4. Compile:
   ./mvnw -DskipTests compile
5. Start/restart Spring Boot with the existing .env credentials:
   set -a
   source .env
   set +a
   export DB_USERNAME=easyticket_user
   ./mvnw spring-boot:run
6. In the Codespaces PORTS tab, open port 8080. The EasyTicket homepage should appear.

IMPORTANT
- Do not delete or re-import the MySQL database.
- Do not run docker compose down -v.
- The frontend calls the existing same-origin APIs:
  GET /api/stations?query=...
  GET /api/trains/search?from=...&to=...&date=YYYY-MM-DD
  GET /api/trains/{trainNumber}/schedule?from=...&to=...
- The frontend does not invent live availability, fare, booking or PNR information. Those are not present in the supplied database/API.
- Timetables are dataset-based; verify actual current railway information before travelling.
