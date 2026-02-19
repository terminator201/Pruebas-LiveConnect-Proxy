import requests
from metodos.Token import obtener_token
from DB.database import save_message


def _stringify_variable(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if value is None:
        return ""
    return "[valor]"


def _find_text_in_payload(node, depth=0):
    if depth > 6 or node is None:
        return ""

    if isinstance(node, str):
        normalized = node.strip()
        return normalized

    if isinstance(node, dict):
        for key in ("mensaje", "texto", "message", "detalle"):
            if key in node:
                found = _find_text_in_payload(node.get(key), depth + 1)
                if found:
                    return found
        for value in node.values():
            found = _find_text_in_payload(value, depth + 1)
            if found:
                return found
        return ""

    if isinstance(node, list):
        for value in node:
            found = _find_text_in_payload(value, depth + 1)
            if found:
                return found
        return ""

    return ""


def _build_quick_answer_log_message(data, response_payload, answer_id, variables):
    template = data.get("registro_visual") or data.get("mensaje_visual")
    if isinstance(template, str) and template.strip():
        template_context = {
            "id_respuesta": str(answer_id),
            **{str(key): _stringify_variable(value) for key, value in variables.items()},
        }
        try:
            rendered = template.format(**template_context).strip()
        except (KeyError, ValueError):
            rendered = template.strip()
        if rendered:
            return rendered

    response_text = _find_text_in_payload(response_payload)
    if response_text:
        return response_text

    variables_summary = ", ".join(
        f"{key}={_stringify_variable(value)}"
        for key, value in variables.items()
        if str(key).strip()
    )
    if variables_summary:
        return f"QuickAnswer {answer_id}: {variables_summary}"
    return f"QuickAnswer {answer_id}"


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
        canal = str(data.get("canal") or data.get("id_canal") or "proxy").strip()
        quick_answer_message = _build_quick_answer_log_message(
            data=data,
            response_payload=response_payload,
            answer_id=answer_id,
            variables=variables,
        )
        try:
            save_message(conversation_id, canal, "agent", quick_answer_message)
        except Exception as error:
            warnings = response_payload.get("warnings")
            if not isinstance(warnings, list):
                warnings = []
            warnings.append(f"No se pudo guardar el quick answer localmente: {str(error)}")
            response_payload["warnings"] = warnings

    return response_payload
