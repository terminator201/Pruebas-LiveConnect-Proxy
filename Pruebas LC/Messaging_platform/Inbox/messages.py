from DB.database import get_messages as repository_get_messages


def get_messages(conversation_id):
    return repository_get_messages(conversation_id)
