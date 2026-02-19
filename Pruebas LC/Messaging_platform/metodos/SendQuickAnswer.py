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

def send_quick_answer(data):
    if not isinstance(data, dict):
        return {"ok": False, "status_code": 400, "error": "Payload JSON invalido"}

    conversation_id = str(data.get("id_conversacion", "")).strip()
    if not conversation_id:
        return {"ok": False, "status_code": 400, "error": "id_conversacion es requerido"}

    raw_answer_id = data.get("id_respuesta")
    try:
        answer_id = int(raw_answer_id)
    except (TypeError, ValueError):
        return {"ok": False, "status_code": 400, "error": "id_respuesta debe ser numerico"}

    variables = data.get("variables", {})
    if variables is None:
        variables = {}
    if not isinstance(variables, dict):
        return {"ok": False, "status_code": 400, "error": "variables debe ser un objeto JSON"}

    token = obtener_token()
    headers = {
        "Content-Type": "application/json",
        "PageGearToken": token
    }

    payload = {
        "id_conversacion": conversation_id,
        "id_respuesta": answer_id,
        "variables": variables
    }

    try:
        res = requests.post(
            "https://api.liveconnect.chat/prod/proxy/sendQuickAnswer",
            json=payload,
            headers=headers,
            timeout=20
        )
    except requests.RequestException as error:
        return {
            "ok": False,
            "status_code": 502,
            "error": f"Error de red en sendQuickAnswer: {str(error)}"
        }

    response_payload = _normalize_response(res)

    if res.ok:
        canal = str(data.get("canal", "proxy"))
        quick_answer_message = f"[QuickAnswer] id_respuesta={answer_id}"
        try:
            save_message(conversation_id, canal, "agent", quick_answer_message)
        except Exception as error:
            warnings = response_payload.get("warnings")
            if not isinstance(warnings, list):
                warnings = []
            warnings.append(f"No se pudo guardar el quick answer localmente: {str(error)}")
            response_payload["warnings"] = warnings

    return response_payload
