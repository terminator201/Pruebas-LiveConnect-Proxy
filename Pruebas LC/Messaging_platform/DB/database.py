import json
import sqlite3
from dataclasses import dataclass

DB_NAME = "database.db"


@dataclass
class SQLiteRepository:
    db_name: str = DB_NAME

    def _connect(self):
        return sqlite3.connect(self.db_name)

    def init_schema(self):
        with self._connect() as conn:
            cursor = conn.cursor()

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    canal TEXT,
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

    def save_message(self, conversation_id, canal, sender, message):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO conversations (id, canal, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    canal = excluded.canal,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (conversation_id, canal),
            )
            cursor.execute(
                """
                INSERT INTO messages (conversation_id, sender, message)
                VALUES (?, ?, ?)
                """,
                (conversation_id, sender, message),
            )

    def list_conversations(self):
        with self._connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, canal, updated_at
                FROM conversations
                ORDER BY updated_at DESC
                """
            )
            rows = cursor.fetchall()
        return [
            {"id": row[0], "canal": row[1], "updated_at": row[2]}
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


def save_message(conversation_id, canal, sender, message):
    default_repository.save_message(conversation_id, canal, sender, message)


def get_conversations():
    return default_repository.list_conversations()


def get_messages(conversation_id):
    return default_repository.list_messages(conversation_id)


def save_balance(balance_data):
    default_repository.save_balance(balance_data)


def get_cached_balance():
    return default_repository.get_cached_balance()
