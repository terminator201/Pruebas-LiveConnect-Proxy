import re

from DB.database import default_repository


URL_PATTERN = re.compile(r"https?://[^\s]+", flags=re.IGNORECASE)


def _get_message_object(data):
    message_obj = data.get("message")
    if isinstance(message_obj, dict):
        return message_obj
    return {}


def _extract_message_text(data):
    message_obj = _get_message_object(data)
    text = message_obj.get("texto")

    if isinstance(text, str):
        return text.strip()
    if isinstance(text, (int, float, bool)):
        return str(text).strip()
    return ""


def _extract_urls(message_text):
    if not message_text:
        return []
    urls = []
    for match in URL_PATTERN.findall(message_text):
        cleaned = match.strip().rstrip(".,;!?)")
        if cleaned and cleaned not in urls:
            urls.append(cleaned)
    return urls


def _extract_file_payload(data):
    message_obj = _get_message_object(data)
    file_obj = message_obj.get("file")
    if not isinstance(file_obj, dict):
        return None

    file_url = file_obj.get("url")
    if not isinstance(file_url, str) or not file_url.strip():
        return None

    file_name = file_obj.get("name")
    if not isinstance(file_name, str) or not file_name.strip():
        file_name = file_obj.get("nombre")

    file_ext = file_obj.get("ext")
    if not isinstance(file_ext, str) or not file_ext.strip():
        file_ext = file_obj.get("extension")

    if (not isinstance(file_ext, str) or not file_ext.strip()) and isinstance(file_name, str):
        if "." in file_name:
            file_ext = file_name.rsplit(".", 1)[1]

    if not isinstance(file_ext, str) or not file_ext.strip():
        url_without_query = file_url.split("?", 1)[0]
        if "." in url_without_query:
            file_ext = url_without_query.rsplit(".", 1)[1]

    normalized_name = file_name.strip() if isinstance(file_name, str) else ""
    if not normalized_name:
        normalized_name = file_url.strip().split("/")[-1] or "archivo"

    normalized_ext = file_ext.strip().lower().lstrip(".") if isinstance(file_ext, str) else ""

    file_payload = {
        "url": file_url.strip(),
        "name": normalized_name,
        "ext": normalized_ext,
        "tipo": file_obj.get("tipo"),
        "width": file_obj.get("width"),
        "height": file_obj.get("height"),
    }
    return file_payload


def _build_file_marker(file_payload):
    if not isinstance(file_payload, dict):
        return ""

    file_url = str(file_payload.get("url") or "").strip()
    file_name = str(file_payload.get("name") or "").strip()
    file_ext = str(file_payload.get("ext") or "").strip().lower().lstrip(".")

    if not file_url:
        return ""

    return f"[FILE]|{file_url}|{file_name}|{file_ext}"


def _build_incoming_message(message_text, file_payload):
    file_marker = _build_file_marker(file_payload)
    if file_marker:
        return file_marker
    if message_text:
        return message_text
    return ""


def _build_message_type(message_obj, file_payload, urls):
    if file_payload and file_payload.get("url"):
        return "file"
    if urls:
        return "link"

    has_metadata = any(
        key in message_obj
        for key in ("messageId", "messageUID", "timestamp", "interno", "f_id", "f_tipo")
    )
    if has_metadata:
        return "structured"
    return "text"


def _build_metadata(message_obj, file_payload, urls):
    metadata = {}

    for key in ("messageId", "messageUID", "tipo", "timestamp", "interno", "f_id", "f_tipo"):
        value = message_obj.get(key)
        if value is not None:
            metadata[key] = value

    if urls:
        metadata["links"] = urls

    if file_payload:
        file_metadata = {}
        for key in ("name", "ext", "tipo", "width", "height"):
            value = file_payload.get(key)
            if value is not None and value != "":
                file_metadata[key] = value
        if file_metadata:
            metadata["file"] = file_metadata

    raw_text = _extract_message_text({"message": message_obj})
    if raw_text:
        metadata["raw_text"] = raw_text

    return metadata or None


def _extract_contact_name(data):
    try:
        name = data["contact_data"]["name"]
    except (KeyError, TypeError):
        return None

    if not isinstance(name, str):
        return None
    normalized_name = name.strip()
    return normalized_name if normalized_name else None


def _resolve_channel(data):
    canal = data.get("canal")
    if canal is None or str(canal).strip() == "":
        canal = data.get("id_canal")
    if canal is None or str(canal).strip() == "":
        return "unknown"
    return str(canal).strip()


def process_incoming_webhook(data, repository=default_repository):
    if not isinstance(data, dict):
        return {"status": "error", "ok": False, "error": "Payload JSON invalido"}

    conversation_id = str(data.get("id_conversacion", "")).strip()
    if not conversation_id:
        return {
            "status": "error",
            "ok": False,
            "error": "id_conversacion es requerido",
        }

    message_obj = _get_message_object(data)
    message_text = _extract_message_text(data)
    urls = _extract_urls(message_text)
    file_payload = _extract_file_payload(data)
    final_message = _build_incoming_message(message_text, file_payload)

    if not final_message:
        return {
            "status": "ignored",
            "ok": True,
            "warning": "Mensaje vacio ignorado",
        }

    contact_name = _extract_contact_name(data)
    canal = _resolve_channel(data)
    message_type = _build_message_type(message_obj, file_payload, urls)
    metadata = _build_metadata(message_obj, file_payload, urls)

    save_kwargs = {
        "conversation_id": conversation_id,
        "canal": canal,
        "sender": "usuario",
        "message": final_message,
        "message_type": message_type,
        "file_url": file_payload.get("url") if file_payload else None,
        "file_name": file_payload.get("name") if file_payload else None,
        "file_ext": file_payload.get("ext") if file_payload else None,
        "metadata": metadata,
    }
    if contact_name:
        save_kwargs["contact_name"] = contact_name

    try:
        repository.save_message(**save_kwargs)
    except TypeError:
        # Fallback for repositories/tests with old signature.
        repository.save_message(
            conversation_id=conversation_id,
            canal=canal,
            sender="usuario",
            message=final_message,
        )

    return {"status": "ok", "ok": True}
