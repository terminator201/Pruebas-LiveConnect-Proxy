from DB.database import default_repository


def _extract_message_text(data):
    try:
        text = data["message"]["texto"]
    except (KeyError, TypeError):
        return ""

    if isinstance(text, str):
        return text.strip()
    if isinstance(text, (int, float, bool)):
        return str(text).strip()
    return ""


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

    message_text = _extract_message_text(data)
    if not message_text:
        return {
            "status": "ignored",
            "ok": True,
            "warning": "Mensaje vacio ignorado",
        }

    contact_name = _extract_contact_name(data)
    canal = _resolve_channel(data)

    save_kwargs = {
        "conversation_id": conversation_id,
        "canal": canal,
        "sender": "usuario",
        "message": message_text,
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
            message=message_text,
        )

    return {"status": "ok", "ok": True}
