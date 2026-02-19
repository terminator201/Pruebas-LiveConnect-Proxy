from DB.database import default_repository


def process_incoming_webhook(data, repository=default_repository):
    if not isinstance(data, dict):
        return {"status": "error", "ok": False, "error": "Payload JSON invalido"}

    conversation_id = data.get("id_conversacion")
    if conversation_id is None or str(conversation_id).strip() == "":
        return {
            "status": "error",
            "ok": False,
            "error": "id_conversacion es requerido",
        }

    canal = data.get("canal") or "unknown"
    sender = data.get("sender") or "usuario"
    message = data.get("mensaje", "")
    if message is None:
        message = ""

    repository.save_message(
        conversation_id=str(conversation_id),
        canal=str(canal),
        sender=str(sender),
        message=str(message),
    )

    return {"status": "ok", "ok": True}
