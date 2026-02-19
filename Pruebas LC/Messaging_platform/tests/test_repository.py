import os
import tempfile
import unittest

from DB.database import SQLiteRepository


class RepositoryTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "repository_test.db")
        self.repository = SQLiteRepository(db_name=self.db_path)
        self.repository.init_schema()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_save_message_updates_existing_conversation(self):
        # Arrange
        self.repository.save_message("conv-10", "whatsapp", "usuario", "Hola")

        # Act
        self.repository.save_message("conv-10", "instagram", "agente", "Respuesta")

        # Assert
        conversations = self.repository.list_conversations()
        self.assertEqual(1, len(conversations))
        self.assertEqual("conv-10", conversations[0]["id"])
        self.assertEqual("instagram", conversations[0]["canal"])

    def test_list_messages_returns_messages_in_insert_order(self):
        # Arrange
        self.repository.save_message("conv-11", "web", "usuario", "Primero")
        self.repository.save_message("conv-11", "web", "agente", "Segundo")

        # Act
        messages = self.repository.list_messages("conv-11")

        # Assert
        self.assertEqual(2, len(messages))
        self.assertEqual("Primero", messages[0]["message"])
        self.assertEqual("Segundo", messages[1]["message"])
        self.assertEqual("usuario", messages[0]["sender"])
        self.assertEqual("agente", messages[1]["sender"])

    def test_save_and_get_cached_balance(self):
        # Arrange
        balance_payload = {"ok": True, "balance": 1234.5, "status_code": 200}

        # Act
        self.repository.save_balance(balance_payload)
        cached_balance = self.repository.get_cached_balance()

        # Assert
        self.assertEqual(balance_payload, cached_balance)


if __name__ == "__main__":
    unittest.main()
