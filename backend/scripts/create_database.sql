-- Ejecutar UNA vez como root en MySQL 8 (MySQL Workbench o consola).
CREATE DATABASE IF NOT EXISTS sonar_despierto
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Usuario de la aplicación con permisos mínimos (cambia la contraseña).
CREATE USER IF NOT EXISTS 'sonar_app'@'localhost' IDENTIFIED BY 'CAMBIAR';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, DROP
  ON sonar_despierto.* TO 'sonar_app'@'localhost';
-- CREATE/ALTER/DROP/INDEX/REFERENCES se necesitan solo para las migraciones (Alembic).
-- En producción se usa un usuario aparte para migraciones y se dejan solo los 4 primeros aquí.
FLUSH PRIVILEGES;
