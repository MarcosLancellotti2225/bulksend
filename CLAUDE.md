# CLAUDE.md — Multi Send Signaturit

## Descripcion del proyecto

**Multi Send Signaturit** es una aplicacion web (HTML/CSS/JS puro, sin frameworks) para enviar solicitudes masivas a traves de la API de Signaturit. Permite enviar firmas electronicas (simple y avanzada), emails certificados y SMS certificados a multiples destinatarios desde archivos de datos (CSV, JSON, XLSX).

La app se despliega en **GitHub Pages** como sitio estatico: https://marcoslancellotti2225.github.io/bulksend/

## Arquitectura

### Frontend (GitHub Pages)
- `index.html` — Estructura HTML con launcher modal + flujo de 4 pasos
- `styles.css` — Estilos con variables CSS, colores Signaturit (#00B4B6 primary, #0D1F3C navy)
- `app.js` — Toda la logica: launcher, parseo de archivos, mapeo, envio masivo

### Proxy (Supabase Edge Function)
- **URL**: `https://plejrqzzxnypnxxnamxj.supabase.co/functions/v1/signaturit-proxy`
- **Proposito**: Evitar CORS. El browser no puede llamar directamente a la API de Signaturit.
- **Funcionamiento**: Recibe POST del frontend con headers custom (`x-signaturit-token`, `x-api-url`), reenvia a Signaturit con `Authorization: Bearer {token}`.
- **GET via override**: Para listar plantillas, se envia `x-method-override: GET` y el proxy hace un GET en lugar de POST.
- **JWT desactivado**: No verifica JWT de Supabase.
- **IMPORTANTE**: La palabra "Supabase" NO debe aparecer jamas en la UI ni en textos visibles. La URL del proxy es solo una constante interna en app.js.

## Flujo de la aplicacion

### Launcher (1 paso)
Seleccionar tipo de solicitud (4 opciones) → "Comenzar":
- Firma avanzada → `POST /v3/signatures.json` + `type=advanced` (soporta multiples firmantes)
- Firma simple → `POST /v3/signatures.json`
- Email certificado → `POST /v3/emails.json`
- SMS certificado → `POST /v3/sms.json`

**No hay modo individual** — solo envio masivo.

### Flujo masivo (4 pasos)

**Step 1 — Configuracion:**
- Entorno (Produccion / Sandbox)
- Token API
- Toggle "Usar plantilla" → carga plantillas via `GET /v3/templates.json` y muestra dropdown
- Asunto, Body, Branding ID (toggles opcionales)
- Toolbar de variables (14 oficiales + custom) con click-to-insert
- Para SMS: textarea de cuerpo del SMS en lugar de subject/body

**Step 2 — Archivos:**
- Upload de datos: **CSV, JSON o XLSX** (SheetJS para XLSX)
- Upload de PDFs: **opcional**, se emparejan por nombre con columna del CSV
- Sidebar derecha con descripcion de columnas esperadas segun el tipo de operacion
- **Plantillas descargables** (CSV, JSON, XLSX) con datos de ejemplo adaptados al tipo de operacion

**Step 3 — Mapeo:**
- Asignacion de columnas del archivo a campos (email, nombre, archivo, telefono)
- Para firma avanzada: boton "+ Anadir firmante" para mapear email_2, name_2, etc.
- Preview table con estado de cada fila (OK/Falta)
- Auto-match inteligente de nombres de columna

**Step 4 — Envio:**
- Validacion pre-envio de URLs en body/subject (Signaturit no las permite)
- Resumen de configuracion
- Delay configurable entre envios
- Progreso en tiempo real (barra + log mejorado con badges, timestamps, tiempo de respuesta, stats en vivo)
- Tabla de resultados con estado y IDs
- Exportar log a CSV

## API de Signaturit — Endpoints usados

```
POST /v3/signatures.json     — Firma simple y avanzada
POST /v3/emails.json          — Email certificado
POST /v3/sms.json             — SMS certificado
GET  /v3/templates.json       — Listar plantillas
```

### Formato de envio (FormData)
```
recipients[0][name] = Nombre
recipients[0][email] = email@ejemplo.com
recipients[1][name] = Segundo firmante    (solo avanzada)
recipients[1][email] = email2@ejemplo.com (solo avanzada)
files[0] = archivo.pdf                    (opcional si usa plantilla)
templates[0] = template-uuid              (solo si usa plantilla)
type = advanced                           (solo firma avanzada)
subject = Asunto                          (opcional)
body = Cuerpo                             (opcional)
branding_id = uuid                        (opcional)
```

### SMS (FormData)
```
recipients[0][phone] = +34600000000
recipients[0][name] = Nombre
body = Texto del SMS
```

### Restricciones conocidas de la API
- **No permite URLs** en `body` ni `subject` (http://, https://, www.) — devuelve "URLs are not allowed in the body"
- Variables de Signaturit como `{{sign_button}}` si estan permitidas (Signaturit las resuelve internamente)

## Variables del sistema
14 variables oficiales de Signaturit: `signer_name`, `signer_email`, `sender_email`, `filename`, `sign_button`, `validate_button`, `email_button`, `email_body`, `logo`, `remaining_time`, `code`, `reason`, `dashboard_button`, `signers`.

Se resuelven en subject/body antes de enviar: `{{signer_name}}` → valor de la fila del CSV.

## Dependencias externas
- Google Fonts: Inter + JetBrains Mono
- SheetJS (xlsx.full.min.js desde CDN) — para parsear y generar XLSX
- Proxy Edge Function (Supabase) — para CORS
- Vite (dev dependency) — dev server con hot reload (`npm run dev`)

## Repositorio
- **GitHub**: https://github.com/MarcosLancellotti2225/bulksend
- **Archivos principales**: `index.html`, `styles.css`, `app.js`
- **Otros archivos**: `package.json`, `.gitignore`, `research.txt`, `CLAUDE.md`
- **Branch**: `main`
- **Deploy**: GitHub Pages automatico

## Reglas de desarrollo

1. **No usar frameworks** — HTML/CSS/JS puro
2. **No mencionar "Supabase"** en ningun texto visible al usuario
3. **Todas las llamadas API** van a traves del proxy
4. **Colores Signaturit**: `#00B4B6` (teal primary), `#0D1F3C` (navy), `#FF6B35` (naranja accent)
5. **Idioma de la UI**: Espanol
6. **El nombre del producto es "Multi Send Signaturit"**
7. **Solo envio masivo** — no hay modo individual (fue eliminado)
8. **PDFs opcionales** — puede enviarse con plantilla o sin adjuntos
9. **Firma avanzada** soporta multiples firmantes por fila

## Estado actual del proyecto (2026-02-18)

### Completado en esta sesion
- [x] Eliminado completamente el modo individual (HTML, JS, CSS)
- [x] Launcher simplificado de 2 pasos a 1 paso
- [x] Renombrado a "Multi Send Signaturit" (titulo, favicon "MS", header)
- [x] Eliminadas funciones: `setupIndividualMode`, `sendIndividual`, `toggleIndTemplate`, `updateIndFileVisibility`, `renderIndSigners`, `addIndSigner`, `removeIndSigner`, `handleIndividualFile`, `proxyPost`, `appendOptionalFields`, `selectSendMode`, `goLauncherStep`
- [x] Eliminadas variables de estado: `sendMode`, `individualFile`, `indSigners`
- [x] Simplificada `fetchTemplates()` (ya no recibe prefix)
- [x] Agregada validacion de URLs en body/subject antes de enviar
- [x] Agregadas plantillas descargables (CSV, JSON, XLSX) en Step 2 sidebar
- [x] Instalado Vite como dev server (`npm run dev`)
- [x] Creado `.gitignore` (excluye node_modules)
- [x] Logs mejorados: badges de estado, timestamps, tiempo de respuesta por envio, stats en vivo (OK/ERR), resumen final con duracion y tasa de exito
- [x] Creado `research.txt` con analisis de envios programados

### Pendiente / Proximos pasos
- [ ] **Notificacion por email al terminar** — Usar Resend dentro de una Edge Function de Supabase. Toggle en Step 4 para activar + campo de email. La Edge Function recibe el resumen y envia el email.
- [ ] **Envios programados** — Ver `research.txt` para analisis completo. Requiere: Supabase DB + Storage + pg_cron + Edge Function con logica de envio server-side. Es un cambio de arquitectura grande. Hay preguntas abiertas sobre seguridad del token, autenticacion de usuarios, politica de retencion de PDFs.
- [ ] **Investigar error "URLs not allowed in body"** — El usuario reporto este error sin haber puesto URLs explicitas. Posible causa: algun caracter o patron que Signaturit interpreta como URL. Pendiente de reproducir y debuggear.
- [ ] **Mejora de logs (cosmetic)** — Los estilos CSS del log ya estan actualizados. Verificar que se ven bien en produccion.
