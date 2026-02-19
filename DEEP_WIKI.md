# Deep Wiki — Pruebas‑LiveConnect‑Proxy

## Resumen ejecutivo
Repositorio de pruebas internas para métodos API de LiveConnect. Implementa un backend Flask que sirve una interfaz web tipo “Inbox” y actúa como proxy hacia la API `https://api.liveconnect.chat`, además de recibir webhooks y persistir conversaciones/mensajes en SQLite. Está diseñado para uso interno (maneja credenciales sensibles).

## Actualizacion de calidad y diseno (19 de febrero de 2026)
Se aplico una mejora incremental en backend y frontend siguiendo principios SOLID/clean code, sin cambiar contratos publicos principales de la app.

### Backend
- `Repository pattern`: se centralizo el acceso a SQLite en `SQLiteRepository`.
- `Service layer`: el procesamiento de webhook se extrajo a `services/webhook_service.py`.
- `Dependency Injection`: el servicio acepta repositorio inyectable para facilitar testing.
- `Fail Fast`: el webhook valida payload y `id_conversacion` antes de persistir.
- `Single Responsibility`: `metodos/Webhook.py` ahora solo delega al servicio.

### Frontend (`templates` + `static`)
- `Separation of Concerns`: se eliminaron handlers inline (`onclick`) y estilos inline.
- `Open/Closed`: acciones UI desacopladas con `data-action` + mapa de handlers.
- `DRY/KISS`: capa de utilidades (`requestJSON`, `postJSON`, `isApiSuccess`) para reducir duplicacion de `fetch`.
- `Replace Magic Numbers`: constantes centralizadas para polling, `id_respuesta` e `id_canal`.
- `Funciones pequenas`: renderizado, eventos y llamadas API separados por responsabilidad.

### Testing y calidad
- Se agregaron tests unitarios deterministas en `Pruebas LC/Messaging_platform/tests/`.
- Ejecucion: `python3 -m unittest discover -s tests -v` (actualmente en verde).

## Estructura del repositorio
- `README.md`
  Descripción general y advertencia de uso interno.
- `Pruebas LC/Messaging_platform/App.py`
  Servidor Flask y rutas HTTP.
- `Pruebas LC/Messaging_platform/metodos/`
  Wrappers para endpoints LiveConnect (token, envío de mensajes, webhooks, balance, transferencias).
- `Pruebas LC/Messaging_platform/Inbox/`
  Lectura de conversaciones/mensajes desde SQLite.
- `Pruebas LC/Messaging_platform/DB/database.py`
  Repositorio SQLite (`SQLiteRepository`) e inicialización de esquema.
- `Pruebas LC/Messaging_platform/templates/index.html`
  UI principal (Inbox web).
- `Pruebas LC/Messaging_platform/static/main.js`
  Lógica frontend con delegación de eventos y utilidades API.
- `Pruebas LC/Messaging_platform/services/webhook_service.py`
  Capa de servicio para validación/persistencia de webhook.
- `Pruebas LC/Messaging_platform/tests/`
  Tests unitarios de repositorio y servicio de webhook.
- `Pruebas LC/Messaging_platform/database.db`
  Base SQLite con `conversations` y `messages`.

## Arquitectura y flujo de datos

```mermaid
flowchart LR
  UI["Inbox Web (index.html + main.js)"] -->|HTTP| Flask["Flask App (App.py)"]
  Flask -->|Proxy| LC["LiveConnect API"]
  LC -->|Webhook POST| Flask
  Flask --> Service["Webhook Service"]
  Service --> Repo["SQLiteRepository"]
  Repo --> SQLite["SQLite database.db"]
  Flask --> UI
```

### Flujos principales
1. Inbox UI consulta `/conversations` y `/messages/<id>` para renderizar.
2. Acciones del usuario (sendMessage, sendQuickAnswer, transfer, balance) llaman al backend Flask, que a su vez proxy hacia LiveConnect usando `PageGearToken`.
3. Webhooks entran por `/webhook/liveconnect`, pasan por una capa de servicio y se persisten en SQLite mediante repositorio.

## Backend (Flask)
Archivo: `Pruebas LC/Messaging_platform/App.py`

### Rutas
- `GET /`
  Render de `index.html`.
- `GET /conversations`
  Lista conversaciones desde SQLite.
- `GET /messages/<conversation_id>`
  Lista mensajes de conversación.
- `POST /webhook/liveconnect`
  Valida payload e inserta conversación/mensaje en SQLite.
- `POST /config/setWebhook`
  Proxy a LiveConnect: set webhook (ruta recomendada de UI).
- `POST /config/getWebhook`
  Proxy a LiveConnect: get webhook (ruta recomendada de UI).
- `GET /config/balance`
  Proxy a LiveConnect: consulta de balance para panel de configuración.
- `GET /config/channels`
  Proxy a LiveConnect: listado de canales para selector.
- `POST /setWebhook`
  Proxy a LiveConnect: set webhook.
- `POST /getWebhook`
  Proxy a LiveConnect: get webhook.
- `POST /sendMessage`
  Proxy a LiveConnect.
- `POST /sendQuickAnswer`
  Proxy a LiveConnect.
- `POST /sendFile`
  Proxy a LiveConnect.
- `POST /transfer`
  Proxy a LiveConnect.
- `GET /balance`
  Proxy a LiveConnect.

### Puntos clave
- `init_db()` se ejecuta al importar el módulo, creando tablas si no existen.
- `/webhook/liveconnect` retorna `400` cuando el payload es inválido.
- La app corre en puerto `3000` (`app.run(port=3000)`).

## Persistencia (SQLite)
Archivo: `Pruebas LC/Messaging_platform/DB/database.py`

### Tablas
`conversations`
- `id` (TEXT, PK)
- `canal` (TEXT)
- `updated_at` (DATETIME, default CURRENT_TIMESTAMP)

`messages`
- `id` (INTEGER, PK AUTOINCREMENT)
- `conversation_id` (TEXT)
- `sender` (TEXT)
- `message` (TEXT)
- `created_at` (DATETIME, default CURRENT_TIMESTAMP)

### Notas de comportamiento
- En el webhook, `sender` por defecto es `"usuario"` si no llega en payload.
- Cada nuevo mensaje hace upsert de conversación y actualiza `updated_at`.
- Lectura de mensajes ordena por `created_at ASC, id ASC` para estabilidad.

## Módulos `metodos/` (proxy LiveConnect)
Archivo clave: `Pruebas LC/Messaging_platform/metodos/Token.py`

- Token caching global con expiración 8 horas (menos 1 minuto).
- Credenciales hardcodeadas (`KEY`, `SECRET`) dentro del repo. Esto es sensible y justifica el uso interno.

### Wrappers disponibles
- `send_message(data)` → `/prod/proxy/sendMessage`
- `send_quick_answer(data)` → `/prod/proxy/sendQuickAnswer`
- `send_file(data)` → `/prod/proxy/sendFile`
- `transfer(data)` → `/prod/proxy/transfer`
- `get_balance()` → `/prod/proxy/balance`
- `set_webhook(data)` → `/prod/proxy/setWebhook`
- `get_webhook(id_canal)` → `/prod/proxy/getWebhook`

Todos usan `PageGearToken` en headers.

## Inbox Web (UI)
Archivos:
- `Pruebas LC/Messaging_platform/templates/index.html`
- `Pruebas LC/Messaging_platform/static/main.js`

### Funcionalidades
- Sidebar con conversaciones (recarga cada 5s).
- Chat central con mensajes.
- Acciones UI por `data-action` (sin `onclick` inline).
- Acciones rápidas:
  - `Saldo` → `/balance`
  - `QuickAnswer` → `/sendQuickAnswer` con `id_respuesta` fijo
  - `Transferir` → `/transfer` con `id_canal` fijo

### Principios de diseno aplicados en frontend
- SRP: funciones separadas para render, API y eventos.
- DRY: helper central para `fetch` GET/POST y validación de respuesta.
- KISS: flujo de inicialización simple (`initApp` + `bindEvents` + polling).
- Separation of Concerns: HTML declara acciones; JS orquesta comportamiento.

### Observación clave
- Al enviar `sendMessage`, no se inserta en SQLite, por lo que la conversación solo refleja mensajes entrantes (webhook), no los salientes, a menos que LiveConnect los devuelva vía webhook.

## Testing automatizado
Directorio: `Pruebas LC/Messaging_platform/tests/`

### Suite actual
- `test_repository.py`
  - actualiza conversación existente en `save_message`
  - preserva orden de mensajes
  - guarda/recupera balance cacheado
- `test_webhook_service.py`
  - persiste conversación y mensaje con payload válido
  - falla con `id_conversacion` ausente
  - falla con payload inválido

### Ejecución
Desde `Pruebas LC/Messaging_platform/`:

`python3 -m unittest discover -s tests -v`

## Uso básico (manual)
Desde `Pruebas LC/Messaging_platform/`:

1. Crear entorno virtual y activar.
2. Instalar deps: `Flask`, `requests`, `Flask-SQLAlchemy`.
3. Ejecutar `App.py`.
4. Abrir `http://localhost:3000/`.

Nota: `requirements.txt` contiene una línea que parece un comando (`python3 -m pip install -r requirements.txt`). Si se usa pip, esa línea puede fallar. Lo correcto es que el archivo tenga solo paquetes.

## Seguridad y consideraciones internas
- Las credenciales (`KEY`, `SECRET`) están embebidas en `metodos/Token.py`.
- Se almacenan mensajes y datos en `database.db` local.
- El README advierte que es exclusivo para equipos internos.

## Limitaciones conocidas / riesgos
- Los mensajes enviados por el agente no se guardan localmente (solo webhook).
- La UI aun depende de `id_canal` y `id_respuesta` fijos, aunque ahora estan centralizados en constantes de `main.js`.
- `requirements.txt` no es estándar.

## Mapa de endpoints (inputs esperados)
Basado en `main.js` y `App.py`:

- `/sendMessage`
  Body: `{ id_conversacion, mensaje }`
- `/sendQuickAnswer`
  Body: `{ id_conversacion, id_respuesta, variables: {...} }`
- `/transfer`
  Body: `{ id_conversacion, id_canal, estado, mensaje }`
- `/config/getWebhook`
  Body: `{ id_canal }`
- `/config/setWebhook`
  Body: según API LiveConnect
- `/config/balance`
  Body: none
- `/config/channels`
  Query params opcionales (ejemplo: `visible=1`)
- `/getWebhook`
  Body: `{ id_canal }`
- `/setWebhook`
  Body: según API LiveConnect
- `/webhook/liveconnect`
  Body: `{ id_conversacion, mensaje, canal, sender }` (`id_conversacion` requerido)

## Actualizacion funcional completa (19 de febrero de 2026)

Esta seccion documenta las mejoras implementadas en webhook, persistencia, render frontend, envio de mensajes/archivos/quick answer y configuracion de webhook desde UI.

### 1. Procesamiento del Webhook

Archivo principal: `Pruebas LC/Messaging_platform/services/webhook_service.py`

#### Estructura real del payload

Ejemplo real recibido desde Proxy LiveConnect:

```json
{
  "id_conversacion": "LCWAP|753|573178560023C",
  "id_canal": 753,
  "message": {
    "texto": "",
    "tipo": 1,
    "file": {
      "url": "https://storage.ejemplo.com/imagen.jpg",
      "nombre": "imagen.jpg",
      "extension": "jpg"
    }
  },
  "contact_data": {
    "name": "Brandon Gallego"
  }
}
```

#### Parseo aplicado

- Texto: `message.texto`
- Archivo: `message.file.url`, `message.file.name|nombre`, `message.file.ext|extension`
- Contacto: `contact_data.name`

Snippet relevante:

```python
def _extract_file_payload(data):
    message_obj = _get_message_object(data)
    file_obj = message_obj.get("file")
    file_url = file_obj.get("url")
    file_name = file_obj.get("name") or file_obj.get("nombre")
    file_ext = file_obj.get("ext") or file_obj.get("extension")
```

#### Manejo de mensajes vacios

- Si llega archivo, se construye un marcador persistible:
  - `"[FILE]|url|nombre|extension"`
- Si no hay texto ni archivo, el webhook se ignora:
  - `{"status":"ignored","ok":true,"warning":"Mensaje vacio ignorado"}`

Snippet relevante:

```python
def _build_incoming_message(message_text, file_payload):
    file_marker = _build_file_marker(file_payload)
    if file_marker:
        return file_marker
    if message_text:
        return message_text
    return ""
```

### 2. Persistencia de Mensajes

Archivo: `Pruebas LC/Messaging_platform/DB/database.py`

#### Funcionamiento de `save_message()`

- Normaliza `conversation_id`, `sender`, `message`, `contact_name`.
- Hace upsert de conversacion.
- Inserta mensaje en `messages`.
- Si no hay `message` textual pero hay archivo, usa fallback (`[Archivo]` o URL).
- Rechaza insercion final si no hay contenido util.

#### Campos almacenados

Tabla `messages` actual:
- `conversation_id`
- `sender`
- `message`
- `message_type`
- `file_url`
- `file_name`
- `file_ext`
- `metadata`
- `created_at`

#### Diferencia de `sender`

- `sender = "usuario"`: mensajes entrantes desde webhook.
- `sender = "agent"`: mensajes enviados desde UI por `sendMessage`, `sendFile`, `sendQuickAnswer`.

#### Convencion de archivos

Para entrada por webhook se guarda:

`[FILE]|url|nombre|extension`

Ejemplo:

`[FILE]|https://storage.ejemplo.com/imagen.jpg|imagen.jpg|jpg`

### 3. Renderizado en Frontend

Archivos:
- `Pruebas LC/Messaging_platform/Inbox/messages.py`
- `Pruebas LC/Messaging_platform/static/main.js`
- `Pruebas LC/Messaging_platform/templates/index.html`

#### Estructura devuelta por `get_messages`

```json
[
  {
    "sender": "usuario",
    "message": "[FILE]|https://storage.ejemplo.com/imagen.jpg|imagen.jpg|jpg",
    "message_type": "file",
    "file_url": "https://storage.ejemplo.com/imagen.jpg",
    "file_name": "imagen.jpg",
    "file_ext": "jpg",
    "metadata": {"tipo": 1}
  }
]
```

#### Deteccion de mensajes tipo archivo

En `main.js` se parsea el prefijo:

```javascript
function parseFileMessage(rawMessage) {
  const normalized = normalizeText(rawMessage);
  if (!normalized.startsWith("[FILE]|")) return null;
  const parts = normalized.split("|");
  return { url: normalizeText(parts[1]), name: normalizeText(parts[2]), extension: normalizeFileExtension(parts[3]) };
}
```

#### Render de tipos

- Texto normal: burbuja tradicional.
- Imagen: tarjeta de archivo + URL clickeable + boton `Abrir archivo` (abre modal).
- Otros archivos: tarjeta con boton `Descargar archivo`.

#### Modal flotante de imagen

`index.html` agrega `#imageModal` con:
- Fondo oscuro.
- Imagen centrada (`#imageModalImage`).
- Link `Abrir en pestana nueva`.
- Boton `Cerrar`.

`main.js` controla apertura/cierre con:
- click en URL o boton abrir.
- click fuera del contenido.
- tecla `Esc`.
- boton `Cerrar`.

### 4. Envio de Mensajes

Archivo: `Pruebas LC/Messaging_platform/metodos/SendMessage.py`

#### Implementacion `proxy/sendMessage`

Payload enviado:

```json
{
  "id_conversacion": "LCWAP|753|573178560023C",
  "mensaje": "Hola"
}
```

#### Persistencia posterior

Cuando la API responde OK:
- se guarda en DB como `sender = "agent"`.
- se registra el texto enviado para verlo en el inbox local.

### 5. Envio de Archivos

Archivo: `Pruebas LC/Messaging_platform/metodos/SendFile.py`

#### Implementacion `proxy/sendFile`

Payload oficial:

```json
{
  "id_conversacion": "LCWAP|753|573178560023C",
  "url": "https://storage.ejemplo.com/documento.pdf",
  "nombre": "documento",
  "extension": "pdf"
}
```

#### Validaciones frontend (`main.js`)

- URL obligatoria y valida (`http://` o `https://`).
- Nombre obligatorio.
- Extension dentro de `ALLOWED_FILE_EXTENSIONS`.
- Se permite inferir extension desde URL cuando aplica.

#### Persistencia local

Cuando el envio es exitoso:
- `sender = "agent"`
- `message_type = "file"`
- se guarda `file_url`, `file_name`, `file_ext`, `metadata`.

### 6. QuickAnswer Dinamico

Archivo: `Pruebas LC/Messaging_platform/metodos/SendQuickAnswer.py`

#### Uso de `id_respuesta`

- Se valida que sea numerico (`int`).
- Se envia junto a `id_conversacion` y `variables`.

#### Variables dinamicas

- `variables` debe ser objeto JSON.
- Se acepta texto con placeholders para construir un registro visual dinamico.

#### Persistencia visual

Al responder OK:
- se guarda en DB como `sender = "agent"`.
- el texto se construye por prioridad:
  1. plantilla custom (`registro_visual` / `mensaje_visual`)
  2. texto detectado en respuesta API
  3. fallback `QuickAnswer {id}` + resumen de variables

### 7. Configuracion del Webhook desde UI

Archivos:
- `Pruebas LC/Messaging_platform/templates/index.html`
- `Pruebas LC/Messaging_platform/static/main.js`
- `Pruebas LC/Messaging_platform/metodos/GetWebhook.py`
- `Pruebas LC/Messaging_platform/App.py`

#### `proxy/setWebhook` (activar/desactivar)

- Botones:
  - `Activar Proxy`
  - `Desactivar Proxy`
- Requieren `id_canal`.
- Para activar, `url` es obligatoria.

#### Nuevo boton de consulta `proxy/getWebhook`

Boton en modal de configuracion:
- `Consultar Webhook`

Flujo:
1. toma `id_canal` del selector/campo manual.
2. llama `POST /config/getWebhook`.
3. renderiza en UI:
   - `Estado actual` (activo/inactivo/eliminado/desconocido)
   - `URL configurada`
   - `Mensaje API`
4. mantiene JSON completo en `#webhookResult`.

Snippet de presentacion:

```javascript
renderWebhookCheckSummary({
  estado: "activo",
  url: "https://mi-webhook.com/liveconnect",
  mensaje: "Consulta completada"
});
```

### 8. Flujo general del sistema

```mermaid
flowchart LR
  Canal["Canal (ej. WhatsApp)"] --> Proxy["Proxy LiveConnect"]
  Proxy -->|Webhook POST| Flask["Flask /webhook/liveconnect"]
  Flask --> Service["webhook_service.py"]
  Service --> DB["SQLite (conversations/messages)"]
  DB --> API["GET /conversations /messages/<id>"]
  API --> Front["Frontend Inbox (index.html + main.js)"]
```

Paso a paso:
1. El canal envia evento al Proxy.
2. Proxy publica el webhook al backend Flask.
3. El servicio parsea texto, archivo y contacto.
4. Se persiste en SQLite.
5. El frontend consulta mensajes por API interna.
6. Se renderiza texto/archivo/link/metadata.
7. Las acciones del agente (`sendMessage`, `sendFile`, `sendQuickAnswer`) se proxyan y se persisten para vista inmediata.
