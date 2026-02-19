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
        normalized.append({"sender": sender, "message": text})
    return normalized
