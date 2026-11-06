# Guía de modo LAN (red de la oficina) — Soñar Despierto

Para quien prepara la computadora anfitriona y la red. La versión para el personal está en el
[manual de usuario](../public/manual.html#lan), capítulo 13. Decisiones: ADR-0003 y ADR-0015.

## 1. Cómo funciona

- **Una** computadora (la anfitriona) tiene el programa, la base de datos y los respaldos.
- Con `LAN_MODE=true` el servidor escucha en `0.0.0.0:8765` (todas las interfaces) en lugar de `127.0.0.1`.
- Las demás computadoras, tabletas y celulares de la misma red entran con el navegador a `http://IP-DE-LA-ANFITRIONA:8765`.
  No instalan nada. Pensado para 2–3 personas a la vez (SQLite en WAL).
- Si el puerto está ocupado, el programa usa el siguiente libre (hasta 20) y lo muestra en la ventana negra.

## 2. Preparar la anfitriona

1. **Red privada:** Configuración → Red e Internet → (Wi-Fi o Ethernet) → Propiedades → *Tipo de perfil de red:
   Privada*. En una red “Pública” Windows bloquea las conexiones entrantes.
2. **IP fija:** en el módem, crea una *reserva DHCP* para la anfitriona (por su dirección MAC: `getmac /v`). Así la
   dirección no cambia. Alternativa: usar el nombre del equipo (`http://NOMBRE-PC:8765`).
3. **Energía:** Configuración → Sistema → Inicio/apagado y suspensión → *Suspender: Nunca* (al menos con corriente).
4. **Activar:** cierra el sistema, edita `%LOCALAPPDATA%\SonarDespierto\config.env` → `LAN_MODE=true`, guarda y abre.
5. **Firewall:** la primera vez Windows pregunta por *Node.js JavaScript Runtime*: marca **solo Redes privadas**.
   Si se cerró ese aviso sin permitir, crea la regla (PowerShell **como administrador**):

   ```powershell
   New-NetFirewallRule -DisplayName "Soñar Despierto (red privada)" -Direction Inbound -Protocol TCP -LocalPort 8765 -Profile Private -Action Allow
   ```

6. En la ventana negra aparece *Desde otras PCs de la red: http://192.168.x.y:8765*. Guárdala en Favoritos en cada equipo.

## 3. Comprobar

```powershell
# En la anfitriona: ¿escucha en todas las interfaces?
netstat -ano | findstr :8765            # debe decir 0.0.0.0:8765  LISTENING
# Desde otra PC con Windows:
Test-NetConnection 192.168.1.25 -Port 8765   # TcpTestSucceeded : True
```

En el navegador de otra PC, `http://192.168.1.25:8765/api/health` debe responder `{"status":"ok","app":"sonar-despierto",…}`.

## 4. Nombres permitidos (cabecera Host)

Desde la F8 el servidor solo responde a direcciones de confianza (protección contra *DNS rebinding*): `localhost`,
cualquier IP, nombres de equipo **sin punto** (`PC-OFICINA`), el nombre de la anfitriona con `.local` o `.lan` y los
que se agreguen en `ALLOWED_HOSTS` (separados por comas). Si aparece **“Dirección no permitida” (421)**, entra con la IP
o agrega el nombre:

```ini
ALLOWED_HOSTS=sonar.oficina.lan,recepcion.midominio.mx
```

## 5. Seguridad

- **Solo en la red de la oficina.** Nunca en Wi-Fi públicas ni redes compartidas con personas ajenas a la asociación.
- En la LAN el tráfico viaja **sin cifrar** (HTTP): alguien en la misma red podría ver lo que se transmite. Usa una
  contraseña WPA2/WPA3 fuerte en el Wi-Fi y una red de invitados separada para visitantes. HTTPS llega con la fase de nube (F9).
- Considera `REGISTRATION_ENABLED=false` para que nadie de la red pueda solicitar cuentas.
- No abras ni redirijas el puerto 8765 en el módem hacia internet.
- Cada persona con su cuenta; la sesión se cierra al cerrar el navegador y dura 8 h como máximo.

## 6. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La ventana negra dice “Acceso desde otras PCs: desactivado” | `LAN_MODE=false` | Edita `config.env` y vuelve a abrir |
| `Test-NetConnection` falla | Firewall o red “Pública” | Paso 2.1 y 2.5 |
| Funcionaba y dejó de funcionar | Cambió la IP de la anfitriona | Reserva DHCP (2.2); revisa la IP en la ventana negra |
| “Dirección no permitida” | Se entró con un nombre con punto | Usa la IP o `ALLOWED_HOSTS` |
| “No se pudo conectar con el servidor” | Anfitriona apagada, suspendida o con la ventana cerrada | Enciéndela y abre el sistema |
| El celular no entra pero las PCs sí | El celular está en la red de invitados o con datos móviles | Conéctalo al Wi-Fi de la oficina |
