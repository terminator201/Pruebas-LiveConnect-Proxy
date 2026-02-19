import os
import tempfile
import unittest

from DB.database import SQLiteRepository
from services.webhook_service import process_incoming_webhook


class WebhookServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "webhook_test.db")
        self.repository = SQLiteRepository(db_name=self.db_path)
        self.repository.init_schema()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_process_incoming_webhook_persists_conversation_and_message(self):
        # Arrange
        payload = {
            "id_conversacion": "conv-1",
            "mensaje": "Hola equipo",
            "canal": "whatsapp",
        }

        # Act
        result = process_incoming_webhook(payload, repository=self.repository)

        # Assert
        self.assertEqual({"status": "ok", "ok": True}, result)
        conversations = self.repository.list_conversations()
        messages = self.repository.list_messages("conv-1")

        self.assertEqual(1, len(conversations))
        self.assertEqual("conv-1", conversations[0]["id"])
        self.assertEqual("whatsapp", conversations[0]["canal"])
        self.assertTrue(conversations[0]["updated_at"])

        self.assertEqual(1, len(messages))
        self.assertEqual("usuario", messages[0]["sender"])
        self.assertEqual("Hola equipo", messages[0]["message"])
        self.assertTrue(messages[0]["created_at"])

    def test_process_incoming_webhook_fails_without_conversation_id(self):
        # Arrange
        payload = {"mensaje": "Sin conversacion"}

        # Act
        result = process_incoming_webhook(payload, repository=self.repository)

        # Assert
        self.assertFalse(result["ok"])
        self.assertEqual("id_conversacion es requerido", result["error"])
        self.assertEqual([], self.repository.list_conversations())

    def test_process_incoming_webhook_fails_with_invalid_payload(self):
        # Act
        result = process_incoming_webhook(None, repository=self.repository)

        # Assert
        self.assertFalse(result["ok"])
        self.assertEqual("Payload JSON invalido", result["error"])


if __name__ == "__main__":
    unittest.main()
