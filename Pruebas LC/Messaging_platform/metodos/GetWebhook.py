import requests
from metodos.Token import obtener_token

def get_webhook(id_canal):
    normalized_channel = str(id_canal).strip()
    if not normalized_channel:
        return {"ok": False, "status_code": 400, "error": "id_canal es requerido"}

    token = obtener_token()
    headers = {
        "Content-Type": "application/json",
        "PageGearToken": token
    }

    try:
        res = requests.post(
            "https://api.liveconnect.chat/prod/proxy/getWebhook",
            json={"id_canal": normalized_channel},
            headers=headers,
            timeout=20
        )
    except requests.RequestException as e:
        return {"ok": False, "status_code": 502, "error": f"Error de red en getWebhook: {str(e)}"}

    try:
        payload = res.json()
    except ValueError:
        payload = {"raw_response": res.text}

    if isinstance(payload, dict):
        payload.setdefault("ok", res.ok)
        payload["status_code"] = res.status_code
        return payload

    return {"ok": res.ok, "status_code": res.status_code, "data": payload}
