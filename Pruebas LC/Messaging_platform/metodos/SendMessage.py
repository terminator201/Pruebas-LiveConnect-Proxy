import requests
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

def send_message(data):
    if not isinstance(data, dict):
        return {"ok": False, "status_code": 400, "error": "Payload JSON invalido"}

    conversation_id = str(data.get("id_conversacion", "")).strip()
    message_text = str(data.get("mensaje", "")).strip()
    if not conversation_id:
        return {"ok": False, "status_code": 400, "error": "id_conversacion es requerido"}
    if not message_text:
        return {"ok": False, "status_code": 400, "error": "mensaje es requerido"}

    token = obtener_token()
    headers = {
        "Content-Type": "application/json",
        "PageGearToken": token
    }

    payload = {
        "id_conversacion": conversation_id,
        "mensaje": message_text
    }

    try:
        res = requests.post(
            "https://api.liveconnect.chat/prod/proxy/sendMessage",
            json=payload,
            headers=headers,
            timeout=20
        )
    except requests.RequestException as error:
        return {
            "ok": False,
            "status_code": 502,
            "error": f"Error de red en sendMessage: {str(error)}"
        }

    response_payload = _normalize_response(res)

    if res.ok:
        canal = str(data.get("canal", "proxy"))
        try:
            save_message(conversation_id, canal, "agent", message_text)
        except Exception as error:
            warnings = response_payload.get("warnings")
            if not isinstance(warnings, list):
                warnings = []
            warnings.append(f"No se pudo guardar el mensaje localmente: {str(error)}")
            response_payload["warnings"] = warnings

    return response_payload
