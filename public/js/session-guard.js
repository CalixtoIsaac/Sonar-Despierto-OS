/**
 * Sin sesión, vuelve al inicio de sesión antes de pintar la aplicación.
 * Es un archivo aparte (y no un <script> dentro de app.html) porque la política de contenido (CSP)
 * solo permite scripts propios del sistema.
 */
try { if (!sessionStorage.getItem('sd.token')) location.replace('/'); } catch (e) { location.replace('/'); }
