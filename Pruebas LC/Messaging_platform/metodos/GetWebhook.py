import requests
from metodos.Token import obtener_token

def get_webhook(id_canal):
    token = obtener_token()
    headers = {
        "Content-Type": "application/json",
        "PageGearToken": token
    }

    try:
        res = requests.post(
            "https://api.liveconnect.chat/prod/proxy/getWebhook",
            json={"id_canal": id_canal},
            headers=headers,
            timeout=20
        )
    except requests.RequestException as e:
        return {"ok": False, "error": f"Error de red en getWebhook: {str(e)}"}

    try:
        payload = res.json()
    except ValueError:
        payload = {"raw_response": res.text}

    if isinstance(payload, dict):
        payload.setdefault("ok", res.ok)
        payload["status_code"] = res.status_code
        return payload

    return {"ok": res.ok, "status_code": res.status_code, "data": payload}
