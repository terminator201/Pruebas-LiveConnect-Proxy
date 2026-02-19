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

    @staticmethod
    def _normalize_optional_text(value):
        if isinstance(value, str):
            normalized = value.strip()
            return normalized if normalized else None
        if isinstance(value, (int, float, bool)):
            normalized = str(value).strip()
            return normalized if normalized else None
        return None

    @staticmethod
    def _normalize_message_type(message_type, has_file_url):
        if has_file_url:
            return "file"

        if not isinstance(message_type, str):
            return "text"

        normalized = message_type.strip().lower()
        allowed = {"text", "file", "link", "structured"}
        if normalized in allowed:
            return normalized
        return "text"

    @staticmethod
    def _normalize_metadata(metadata):
        if metadata is None:
            return None

        if isinstance(metadata, str):
            normalized = metadata.strip()
            return normalized if normalized else None

        if isinstance(metadata, (dict, list)):
            try:
                return json.dumps(metadata, ensure_ascii=False)
            except (TypeError, ValueError):
                return None

        return None

    @staticmethod
    def _deserialize_metadata(raw_metadata):
        if not isinstance(raw_metadata, str):
            return None
        normalized = raw_metadata.strip()
        if not normalized:
            return None
        try:
            parsed = json.loads(normalized)
            if isinstance(parsed, (dict, list)):
                return parsed
        except json.JSONDecodeError:
            pass
        return {"raw": normalized}

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
                    message_type TEXT DEFAULT 'text',
                    file_url TEXT,
                    file_name TEXT,
                    file_ext TEXT,
                    metadata TEXT,
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

            cursor.execute("PRAGMA table_info(messages)")
            message_columns = {row[1] for row in cursor.fetchall()}
            if "message_type" not in message_columns:
                cursor.execute("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'text'")
            if "file_url" not in message_columns:
                cursor.execute("ALTER TABLE messages ADD COLUMN file_url TEXT")
            if "file_name" not in message_columns:
                cursor.execute("ALTER TABLE messages ADD COLUMN file_name TEXT")
            if "file_ext" not in message_columns:
                cursor.execute("ALTER TABLE messages ADD COLUMN file_ext TEXT")
            if "metadata" not in message_columns:
                cursor.execute("ALTER TABLE messages ADD COLUMN metadata TEXT")

    def save_message(
        self,
        conversation_id,
        canal,
        sender,
        message,
        contact_name=None,
        message_type=None,
        file_url=None,
        file_name=None,
        file_ext=None,
        metadata=None,
    ):
        normalized_conversation_id = str(conversation_id or "").strip()
        normalized_canal = str(canal or "").strip() or "unknown"
        normalized_sender = str(sender or "").strip() or "usuario"
        normalized_message = self._normalize_message_text(message)
        normalized_contact_name = self._normalize_contact_name(contact_name)
        normalized_file_url = self._normalize_optional_text(file_url)
        normalized_file_name = self._normalize_optional_text(file_name)
        normalized_file_ext = self._normalize_optional_text(file_ext)
        normalized_metadata = self._normalize_metadata(metadata)
        normalized_message_type = self._normalize_message_type(
            message_type=message_type,
            has_file_url=bool(normalized_file_url),
        )

        if not normalized_conversation_id:
            raise ValueError("conversation_id es requerido")

        if not normalized_message:
            if normalized_file_name:
                normalized_message = f"[Archivo] {normalized_file_name}"
            elif normalized_file_url:
                normalized_message = normalized_file_url

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
                INSERT INTO messages (
                    conversation_id,
                    sender,
                    message,
                    message_type,
                    file_url,
                    file_name,
                    file_ext,
                    metadata
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    normalized_conversation_id,
                    normalized_sender,
                    normalized_message,
                    normalized_message_type,
                    normalized_file_url,
                    normalized_file_name,
                    normalized_file_ext,
                    normalized_metadata,
                ),
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
                SELECT sender, message, message_type, file_url, file_name, file_ext, metadata, created_at
                FROM messages
                WHERE conversation_id = ?
                AND TRIM(COALESCE(message, '')) <> ''
                ORDER BY created_at ASC, id ASC
                """,
                (conversation_id,),
            )
            rows = cursor.fetchall()
        return [
            {
                "sender": row[0],
                "message": row[1],
                "message_type": row[2],
                "file_url": row[3],
                "file_name": row[4],
                "file_ext": row[5],
                "metadata": self._deserialize_metadata(row[6]),
                "created_at": row[7],
            }
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


def save_message(
    conversation_id,
    canal,
    sender,
    message,
    contact_name=None,
    message_type=None,
    file_url=None,
    file_name=None,
    file_ext=None,
    metadata=None,
):
    return default_repository.save_message(
        conversation_id=conversation_id,
        canal=canal,
        sender=sender,
        message=message,
        contact_name=contact_name,
        message_type=message_type,
        file_url=file_url,
        file_name=file_name,
        file_ext=file_ext,
        metadata=metadata,
    )


def get_conversations():
    return default_repository.list_conversations()


def get_messages(conversation_id):
    return default_repository.list_messages(conversation_id)


def save_balance(balance_data):
    default_repository.save_balance(balance_data)


def get_cached_balance():
    return default_repository.get_cached_balance()
