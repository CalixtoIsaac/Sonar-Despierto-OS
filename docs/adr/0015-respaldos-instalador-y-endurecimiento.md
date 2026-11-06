# ADR-0015: Respaldos .zip en caliente con restauración validada, instalador por usuario y endurecimiento del servidor local

- **Estado:** Aceptado
- **Fecha:** 2026-11-05
- **Decisores:** Equipo de desarrollo (Isaac Galeana, Uziel García, Antonio Anaya, Galilea Valencia, Matías Garrido)
- **Relacionado con:** ADR-0002 (respaldo = copiar un archivo, se automatiza en F8), ADR-0003 (ejecución local y modo LAN), ADR-0007 (sesión JWT con `token_version`), ADR-0009 (stack), ADR-0011 (fotos en `uploads\`), [`../fases/Fase_8_Contratos.md`](../fases/Fase_8_Contratos.md)

## Contexto

La F8 entrega el sistema a la oficina. Hacen falta: respaldos que no dependan de que alguien se acuerde, una forma
segura de volver atrás, un instalador para una PC sin Node.js y una revisión de seguridad antes de capturar datos
reales de menores. Restricciones: una sola PC anfitriona, personal no técnico, sin internet, sin servidor de
respaldos, `better-sqlite3` síncrono y en WAL, fotos fuera de la base (`uploads\`).

## Decisión

1. **Un respaldo es un `.zip`** en `{DATA_DIR}\backups\sonar-<tipo>-AAAAMMDD-HHMMSS.zip` con `manifest.json` (primera
   entrada, sin comprimir, para listarlo sin abrir el ZIP), `sonar.db` y `uploads/…`. **No** incluye `secret.key`,
   `config.env` ni `logs`. ZIP propio sin dependencias (`lib/zip.js`, el mismo que el Excel de la F7).
2. **Copia en caliente** con la API de respaldo de SQLite (`db.backup()`): no hay que cerrar el sistema. La copia se pasa
   a `journal_mode = DELETE` (archivo único), se revisa con `integrity_check` y se guarda con su SHA-256.
3. **Automático, uno al día:** al minuto de abrir y cada 30 min se revisa si ya hay un respaldo `auto` de hoy (hora de
   Veracruz). Además, respaldos de seguridad **antes de restaurar** y **antes de actualizar** (BD con migraciones
   pendientes, antes de aplicarlas). Rotación por tipo: `BACKUP_KEEP` automáticos (14), 30 manuales, 5 de cada tipo de
   seguridad. Copia extra opcional a `BACKUP_COPY_DIR` (otra unidad, USB o carpeta en la nube); si falla, el respaldo
   principal sigue siendo válido y se avisa.
4. **Restaurar** (solo ADMIN, escribiendo `RESTAURAR`): se valida **todo antes de tocar nada** (ZIP íntegro con CRC,
   rutas sin `..`, solo `manifest.json`, `sonar.db` y `uploads/`, SHA-256, `integrity_check`, esquema ≤ el del programa y
   al menos un ADMIN activo); se hace el respaldo "antes de restaurar"; el reemplazo de la base y las fotos es
   **síncrono** (ninguna petición se intercala en Node) con vuelta atrás si algo falla; se aplican las migraciones
   pendientes del respaldo y se incrementa `token_version` de **todos** los usuarios (se cierran todas las sesiones).
   También desde la línea de comandos (`--restaurar`, `Restaurar.bat`) con el sistema cerrado, para cuando no abre.
5. **Instalador Inno Setup por usuario** (`PrivilegesRequired=lowest`) en `%LOCALAPPDATA%\Programs\SonarDespierto`, a
   partir del paquete portátil ya probado; los datos siguen en `%LOCALAPPDATA%\SonarDespierto` y nunca se borran al
   actualizar o desinstalar. Accesos: programa, respaldar ahora, carpeta de datos, manual, config.env y (opcional)
   demostración.
6. **Endurecimiento** del servidor local: CSP estricta para scripts (`script-src 'self'`, sin scripts en línea),
   `frame-ancestors 'none'`, `Permissions-Policy`, `Cross-Origin-Opener/Resource-Policy`, `Cache-Control: no-store` en toda
   la API y **validación de la cabecera `Host`** (contra *DNS rebinding*: solo `localhost`, IP, nombres de equipo sin
   punto, el nombre de la PC y `ALLOWED_HOSTS`).
7. **Datos de demostración** cargados por la API (con sus validaciones y bitácora) en una carpeta y un puerto propios
   (`--demo`, 8775), con una franja visible en todas las pantallas.

## Consecuencias

- ✅ Restaurar funciona igual desde la pantalla, subiendo un archivo o desde la consola, y es reversible.
- ✅ Un respaldo viejo se puede restaurar en un programa nuevo (se migra); uno de una versión más nueva se rechaza.
- ✅ Sin dependencias nuevas; `npm audit` sin vulnerabilidades.
- ⚠️ Los respaldos **no están cifrados**: contienen datos de menores. Se mitiga con la descarga auditada, sin
  `secret.key`, y con las indicaciones del manual; el cifrado queda como pendiente de la directiva.
- ⚠️ El respaldo vive en el mismo disco salvo que se configure `BACKUP_COPY_DIR` o se descargue: el manual pide una copia
  semanal fuera de la PC.
- ⚠️ Los datos capturados entre el respaldo "antes de restaurar" y el reemplazo (milisegundos) se pierden con la restauración.
- ⚠️ El ZIP se arma en memoria: suficiente para la base y las fotos de la organización (las fotos se reducen en el
  navegador); `MAX_RESTORE_MB` limita la subida (1024 MB).
- ⚠️ El modo LAN sigue siendo HTTP sin cifrar en la red local (HTTPS llega en la F9). Documentado en la guía de modo LAN.
- ⚠️ El instalador no tiene firma digital (aviso de SmartScreen) y el ícono es provisional hasta el logotipo oficial.

## Alternativas consideradas

- **Copiar `sonar.db` tal cual:** con WAL puede quedar incompleta si el sistema está abierto; no incluye fotos.
- **Carpeta por respaldo en vez de `.zip`:** más difícil de descargar, mover a una USB y validar como unidad.
- **Restaurar solo con el sistema cerrado:** más simple, pero el personal no técnico necesitaría la consola; se dejó
  como vía de emergencia.
- **Rotar `secret.key` al restaurar** para cerrar sesiones: también invalidaría la clave de otras instalaciones de
  prueba y no cubre la CLI; `token_version` ya existe para eso (ADR-0007).
- **Instalador para todos los usuarios (Program Files):** pide permisos de administrador y separaría el programa de los
  datos por usuario; la oficina usa una cuenta de Windows.
- **Cifrar los respaldos con contraseña:** requiere gestionar y no perder esa contraseña; se propone a la directiva.
