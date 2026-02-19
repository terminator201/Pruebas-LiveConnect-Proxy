from DB.database import get_messages as repository_get_messages


def get_messages(conversation_id):
    messages = repository_get_messages(conversation_id)
    return [
        {
            "sender": message.get("sender", "usuario"),
            "message": message.get("message", "")
        }
        for message in messages
    ]
