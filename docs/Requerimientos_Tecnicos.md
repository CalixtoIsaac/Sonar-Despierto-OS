# Documento de Requisitos Técnicos (PRD) - Sistema de Gestión *Soñar Despierto*

> 🔄 **Actualización 2026-10-23 (ADR-0009):** stack vigente: **Node.js + Express + SQLite (`better-sqlite3`) + HTML/CSS/JavaScript sin frameworks**, el mismo de SEMA y My Best DataBase; ejecución local con `SonarDespierto.bat` o paquete portátil con modo LAN opcional, sin requerir internet. Roles ADMIN/OPERADOR (ADR-0004) y auto-registro con aprobación (ADR-0008) sin cambios.

> ⚠️ **Actualización 2026-10-17:** stack vigente del MVP local: React + Vite + Tailwind (ADR-0001), FastAPI + SQLite (ADR-0002), ejecutable local con modo LAN opcional, sin requerir internet (ADR-0003), y acceso solo para personal con roles ADMIN/OPERADOR (ADR-0004). Ver [`adr/`](adr/README.md) y [`Roadmap_Fases.md`](Roadmap_Fases.md).

---

## 1. Resumen del Producto

El **Sistema de Gestión Integral para Soñar Despierto** es una plataforma web centralizada diseñada para optimizar la organización y logística de los eventos masivos de la asociación (como el *Día del Niño* y la entrega de regalos de *Navidad*). Su objetivo principal es automatizar y asegurar el registro, control y seguimiento de los voluntarios, niños beneficiarios, tutores y la trazabilidad de las cartas y regalos, eliminando la dispersión de datos en hojas de cálculo y mejorando la eficiencia operativa antes, durante y después de cada evento.

La aplicación está dirigida tanto al equipo coordinador interno como a los voluntarios y colaboradores de la organización, sirviendo como la fuente única de verdad para la gestión de datos sensibles, logísticos y de inventario social.

---

## 2. Objetivos Principales

* **Centralizar la Información:** Agrupar en una sola base de datos relacional el registro de voluntarios, niños, escuelas y tutores para facilitar el acceso seguro y ordenado.
* **Digitalizar el Ciclo de Regalos:** Implementar un flujo de trazabilidad digital para las cartas de Navidad (desde la solicitud del niño hasta su entrega final), garantizando que ningún regalo se quede sin padrino o sin entregar.
* **Optimizar la Logística de Eventos:** Agilizar la asignación de roles, el control de asistencia y la coordinación en campo durante los eventos masivos mediante una interfaz web accesible desde cualquier dispositivo.

---

## 3. Público Objetivo / Usuarios

* **Coordinadores Generales:** Necesitan visualizar métricas globales, exportar reportes, asignar voluntarios y supervisar el estatus general de los eventos y regalos.
* **Voluntarios (Staff / Padrinos):** Necesitan registrar sus datos de perfil, postularse a áreas de apoyo y (en el caso de padrinos) consultar o seleccionar cartas de niños para donar regalos.
* **Profesores / Tutores Responsables:** Necesitan registrar grupos de niños de sus escuelas o comunidades y autorizar la participación y manejo de datos básicos.

---

## 4. Funcionalidades (Priorizadas)

### A. MVP (Mínimo Producto Viable) — Lo indispensable para lanzar

1. **Módulo de Autenticación y Roles**
* *Qué hace:* Permite iniciar sesión con roles diferenciados (Administrador/Coordinador, Voluntario, Tutor).
* *Quién la usa:* Todos los usuarios.
* *Reglas de negocio:* Contraseñas cifradas (bcrypt), control de acceso basado en roles (RBAC).


2. **Registro y Perfil de Voluntarios**
* *Qué hace:* Captura datos personales, de contacto, de emergencia, talla de playera y área de interés.
* *Quién la usa:* Voluntarios y administradores.


3. **Registro de Niños y Escuelas (Beneficiarios)**
* *Qué hace:* Captura el listado de niños con datos como nombre, fecha de nacimiento, escuela, grado y tutor responsable.
* *Quién la usa:* Coordinadores y tutores.


4. **Módulo de Cartas Digitales y Regalos (Navidad)**
* *Qué hace:* Permite registrar la carta del niño (deseo principal, secundario, fotografía de la carta física) y gestionar su estatus (*Pendiente*, *Asignado a Padrino*, *Recibido*, *Entregado*).
* *Quién la usa:* Coordinadores y donadores/padrinos.
* *Ejemplo de flujo:* Un niño escribe su carta $\rightarrow$ Se sube al sistema con código único $\rightarrow$ Un voluntario la adopta como padrino $\rightarrow$ Se marca como entregada el día del evento.



### B. Fase 2 — Importante pero no urgente

1. **Sistema de Asignación (Matchmaking Niño ↔ Voluntario)**
* *Qué hace:* Vincula de forma lógica a un guía voluntario con un niño para el cuidado durante el evento masivo.


2. **Control de Asistencia (Check-in en Campo)**
* *Qué hace:* Registro rápido de llegada de niños y voluntarios el día del evento mediante escaneo o selección rápida.


3. **Dashboard Ejecutivo y Estadísticas**
* *Qué hace:* Gráficas en tiempo real del porcentaje de regalos conseguidos, asistencia confirmada y voluntarios inscritos.



### C. Ideas Futuras — Nice-to-have

1. **Generación automática de gafetes o credenciales** con códigos QR individuales.
2. **Portal de carga masiva (CSV/Excel)** para que las escuelas suban listas grandes de alumnos.
3. **Notificaciones automáticas** vía correo electrónico o WhatsApp sobre el estatus de las cartas.

---

## 5. Plataforma y Alcance Técnico

* **Tipo de Plataforma:** Aplicación Web responsiva (optimizada para computadoras de escritorio utilizadas por coordinadores y dispositivos móviles para uso rápido en campo).
* **Stack Tecnológico Seleccionado:**
* *Frontend:* HTML5, CSS3 y JavaScript sin frameworks (mismo UI kit que SEMA), con el diseño de Lovable.
* *Backend:* **Node.js + Express** (mismo stack que SEMA y My Best DataBase; ADR-0009).
* *Base de Datos:* **SQLite** con `better-sqlite3` en el MVP local, con reglas de portabilidad para pasar a MySQL/PostgreSQL en la nube.
* *Autenticación:* Tokens JWT (`jsonwebtoken`) y contraseñas con `bcryptjs`.


* **Requisitos de conectividad:** El MVP local **no requiere internet** (ADR-0003): funciona en una PC y, opcionalmente, en la red de la oficina.

---

## 6. Diseño y Experiencia de Usuario (UX/UI)

* **Estilo Visual:** Moderno, limpio, institucional y empático. Utilizará la paleta de colores oficial de la organización *Soñar Despierto* para transmitir confianza, alegría y orden.
* **Referencias:** Diseños limpios tipo paneles de control corporativos combinados con interfaces amigables para donantes (ej. plataformas de gestión de fundaciones o paneles de dashboards modernos).
* **Flujos Principales:**
1. *Landing / Login* $\rightarrow$ *Dashboard Principal según rol* $\rightarrow$ *Gestión de Registros / Cartas*.

* **Paleta de Colores**
La paleta transmite calidez, energía, alegría y optimismo, ideales para una organización enfocada en la infancia y la juventud.
|--|--|--|--|
|Color|Tono / Función|Código Hex aproximado|Significado y Sensación|
|Rojo Coral / Cálido|Arco exterior del sol/arcoíris|#EF4044|Pasión, energía, vitalidad y dinamismo.|
|Naranja Cálido|Arco intermedio|#F18A3B|Entusiasmo, creatividad, calidez y amigabilidad.|
|Amarillo Brillante|Arco interior|#FFDF00|Luz, alegría, optimismo y esperanza.|
|Negro / Carbón|Texto principal y destellos|#1A1A1A|Estructura, contraste, legibilidad y solidez.|
|Blanco|Fondo|#FFFFFF|Transparencia, pureza y simplicidad.|

* **Elementos Gráficos e Identidad Visual**
1. El Símbolo (Imagotipo)
Sol / Arcoíris Radiante: Representa un amanecer o despertar, haciendo un juego visual directo con el nombre "Soñar Despierto".   
Trazo Orgánico e Ilustrativo: Las líneas del sol y los destellos superiores tienen un acabado a mano alzada (tipo hand-drawn), lo que le da un toque humano, cercano, infantil y accesible.   

2. Tipografía
"Soñar": Tipografía estilo sans-serif en negrita (bold), con esquinas redondeadas y trazo amigable pero fuerte, asegurando una rápida lectura.   

"Despierto": Tipografía sans-serif geométrica, limpia, con trazos finos y bien espaciados (kerning abierto), aportando balance visual.   

"Veracruz": Tipografía estilo serif o cursiva elegante, que sirve como distintivo local para la sede regional.   

Tip de Aplicación: Mantén fondos claros (preferentemente blancos o tonos pastel neutros) para conservar el alto contraste de la tipografía negra y permitir que los tonos cálidos del ícono destaquen.

---

## 7. Datos y Modelos (Entidades Principales y Relaciones)

* **User (Usuario):** Almacena credenciales, correo, rol (Admin, Voluntario, Tutor) y estado activo.
* **VolunteerProfile (Perfil de Voluntario):** Relacionado 1:1 con `User`. Guarda datos de contacto, emergencia, talla y área.
* **School (Escuela):** Almacena nombre, zona y profesor de contacto.
* **Child (Niño Beneficiario):** Relacionado con una `School` y un `Tutor`. Guarda nombre, fecha de nacimiento, grado y grupo.
* **Letter (Cartita):** Relacionada 1:1 con un `Child`. Contiene el deseo, estatus del regalo (`Pendiente`, `Asignado`, `Entregado`) y el ID del `User` (padrino) que la adoptó.
* **Event (Evento):** Almacena datos de los eventos masivos (ej. *Navidad 2026*, *Día del Niño 2027*).

---

## 8. Restricciones y Requisitos No Funcionales

* **Seguridad y Privacidad:** Tratamiento ético y seguro de datos personales de menores de edad. Las contraseñas deben estar cifradas y el acceso a los datos de los niños debe estar restringido exclusivamente a perfiles autorizados.
* **Rendimiento:** Tiempos de respuesta menores a 2 segundos en consultas de listados e inventario de regalos.
* **Idioma:** Interfaz completa en Español.
* **Accesibilidad:** Diseño adaptado para lectura clara en pantallas móviles bajo luz de día (ideal para operaciones en campo).

---

## 9. Criterios de Éxito

* **Trazabilidad del 100% en Regalos:** Que ninguna carta registrada en el sistema de Navidad pierda su estatus o quede sin seguimiento de entrega.
* **Reducción de Errores de Captura:** Disminución drástica de registros duplicados de voluntarios o niños en comparación con el uso previo de hojas de cálculo dispersas.
* **Adopción Operativa:** Que el equipo de coordinación logre gestionar el registro completo de su próximo evento masivo utilizando exclusivamente la plataforma web.