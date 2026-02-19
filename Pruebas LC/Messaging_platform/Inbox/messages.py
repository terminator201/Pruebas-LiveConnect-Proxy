from DB.database import get_messages as repository_get_messages


def get_messages(conversation_id):
    messages = repository_get_messages(conversation_id)
    normalized = []
    for message in messages:
        sender = "usuario" if message.get("sender") == "usuario" else "agent"
        text = message.get("message")
        if isinstance(text, str):
            text = text.strip()
        elif isinstance(text, (int, float, bool)):
            text = str(text).strip()
        else:
            text = ""
        if not text:
            continue
        normalized.append(
            {
                "sender": sender,
                "message": text,
                "message_type": message.get("message_type") or "text",
                "file_url": message.get("file_url"),
                "file_name": message.get("file_name"),
                "file_ext": message.get("file_ext"),
                "metadata": message.get("metadata"),
            }
        )
    return normalized
