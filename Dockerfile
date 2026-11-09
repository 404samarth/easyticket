
FROM eclipse-temurin:21-jdk

WORKDIR /app

COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY src ./src

RUN chmod +x mvnw && ./mvnw clean package -DskipTests

EXPOSE 8080

CMD ["sh", "-c", "java -Xms128m -Xmx384m -jar target/*.jar --server.port=${PORT:-8080}"]
