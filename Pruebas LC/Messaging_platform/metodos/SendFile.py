import requests
import re
from metodos.Token import obtener_token
from DB.database import save_message


def _normalize_response(response):
    try:
        payload = response.json()
    except ValueError:
        payload = {"raw_response": response.text}

    if isinstance(payload, dict):
        payload.setdefault("ok", response.ok)
        payload["status_code"] = response.status_code
        return payload

    return {"ok": response.ok, "status_code": response.status_code, "data": payload}

def send_file(data):
    if not isinstance(data, dict):
        return {"ok": False, "status_code": 400, "error": "Payload JSON invalido"}

    conversation_id = str(data.get("id_conversacion", "")).strip()
    file_url = str(data.get("url", "")).strip()
    file_name = str(data.get("nombre", "")).strip()
    extension = str(data.get("extension", "")).strip().lower().lstrip(".")

    if not conversation_id:
        return {"ok": False, "status_code": 400, "error": "id_conversacion es requerido"}
    if not file_url:
        return {"ok": False, "status_code": 400, "error": "url es requerido"}
    if not file_name:
        return {"ok": False, "status_code": 400, "error": "nombre es requerido"}
    if not extension:
        return {"ok": False, "status_code": 400, "error": "extension es requerida"}
    if not re.fullmatch(r"[a-zA-Z0-9]+", extension):
        return {"ok": False, "status_code": 400, "error": "extension invalida"}

    token = obtener_token()
    headers = {
        "Content-Type": "application/json",
        "PageGearToken": token
    }

    payload = {
        "id_conversacion": conversation_id,
        "url": file_url,
        "nombre": file_name,
        "extension": extension
    }

    try:
        res = requests.post(
            "https://api.liveconnect.chat/prod/proxy/sendFile",
            json=payload,
            headers=headers,
            timeout=20
        )
    except requests.RequestException as error:
        return {
            "ok": False,
            "status_code": 502,
            "error": f"Error de red en sendFile: {str(error)}"
        }

    response_payload = _normalize_response(res)

    if res.ok:
        canal = str(data.get("canal", "proxy"))
        final_name = file_name
        suffix = f".{extension}"
        if not file_name.lower().endswith(suffix):
            final_name = f"{file_name}{suffix}"
        try:
            save_message(conversation_id, canal, "agent", f"[Archivo] {final_name}")
        except Exception as error:
            warnings = response_payload.get("warnings")
            if not isinstance(warnings, list):
                warnings = []
            warnings.append(f"No se pudo guardar el archivo localmente: {str(error)}")
            response_payload["warnings"] = warnings

    return response_payload
