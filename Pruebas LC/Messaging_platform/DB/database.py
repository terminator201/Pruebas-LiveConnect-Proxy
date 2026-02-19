import json
import sqlite3
from dataclasses import dataclass

DB_NAME = "database.db"


@dataclass
class SQLiteRepository:
    db_name: str = DB_NAME

    def _connect(self):
        return sqlite3.connect(self.db_name)

    @staticmethod
    def _normalize_message_text(message):
        if isinstance(message, str):
            normalized = message.strip()
            return normalized

        if isinstance(message, (int, float, bool)):
            normalized = str(message).strip()
            return normalized

        return ""

    @staticmethod
    def _normalize_contact_name(contact_name):
        if not isinstance(contact_name, str):
            return None
        normalized = contact_name.strip()
        return normalized if normalized else None

    def init_schema(self):
        with self._connect() as conn:
            cursor = conn.cursor()

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    canal TEXT,
                    contact_name TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT,
                    sender TEXT,
                    message TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS system_config (
                    key TEXT PRIMARY KEY,
                    value TEXT
                )
                """
            )

            cursor.execute("PRAGMA table_info(conversations)")
            conversation_columns = {row[1] for row in cursor.fetchall()}
            if "contact_name" not in conversation_columns:
                cursor.execute("ALTER TABLE conversations ADD COLUMN contact_name TEXT")

    def save_message(self, conversation_id, canal, sender, message, contact_name=None):
        normalized_conversation_id = str(conversation_id or "").strip()
        normalized_canal = str(canal or "").strip() or "unknown"
        normalized_sender = str(sender or "").strip() or "usuario"
        normalized_message = self._normalize_message_text(message)
        normalized_contact_name = self._normalize_contact_name(contact_name)

        if not normalized_conversation_id:
            raise ValueError("conversation_id es requerido")

        if not normalized_message:
            return False

        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO conversations (id, canal, contact_name, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    canal = excluded.canal,
                    contact_name = CASE
                        WHEN excluded.contact_name IS NULL OR excluded.contact_name = ''
                        THEN conversations.contact_name
                        ELSE excluded.contact_name
                    END,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (normalized_conversation_id, normalized_canal, normalized_contact_name),
            )
            cursor.execute(
                """
                INSERT INTO messages (conversation_id, sender, message)
                VALUES (?, ?, ?)
                """,
                (normalized_conversation_id, normalized_sender, normalized_message),
            )
        return True

    def list_conversations(self):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, canal, contact_name, updated_at
                FROM conversations
                ORDER BY updated_at DESC
                """
            )
            rows = cursor.fetchall()
        return [
            {"id": row[0], "canal": row[1], "contact_name": row[2], "updated_at": row[3]}
            for row in rows
        ]

    def list_messages(self, conversation_id):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT sender, message, created_at
                FROM messages
                WHERE conversation_id = ?
                AND TRIM(COALESCE(message, '')) <> ''
                ORDER BY created_at ASC, id ASC
                """,
                (conversation_id,),
            )
            rows = cursor.fetchall()
        return [
            {"sender": row[0], "message": row[1], "created_at": row[2]}
            for row in rows
        ]

    def save_balance(self, balance_data):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT OR REPLACE INTO system_config (key, value)
                VALUES (?, ?)
                """,
                ("balance", json.dumps(balance_data)),
            )

    def get_cached_balance(self):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT value FROM system_config
                WHERE key = ?
                """,
                ("balance",),
            )
            row = cursor.fetchone()

        if row:
            return json.loads(row[0])
        return None


default_repository = SQLiteRepository()


def get_db():
    return sqlite3.connect(DB_NAME)


def init_db():
    default_repository.init_schema()


def save_message(conversation_id, canal, sender, message, contact_name=None):
    return default_repository.save_message(
        conversation_id=conversation_id,
        canal=canal,
        sender=sender,
        message=message,
        contact_name=contact_name,
    )


def get_conversations():
    return default_repository.list_conversations()


def get_messages(conversation_id):
    return default_repository.list_messages(conversation_id)


def save_balance(balance_data):
    default_repository.save_balance(balance_data)


def get_cached_balance():
    return default_repository.get_cached_balance()
