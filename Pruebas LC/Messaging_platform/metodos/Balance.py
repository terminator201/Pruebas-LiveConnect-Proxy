import requests
from metodos.Token import obtener_token
from DB.database import save_balance

def get_balance():
    token = obtener_token()
    headers = {"PageGearToken": token}

    try:
        res = requests.get(
            "https://api.liveconnect.chat/prod/proxy/balance",
            headers=headers,
            timeout=20
        )
    except requests.RequestException as e:
        return {"ok": False, "error": f"Error de red en balance: {str(e)}"}

    try:
        payload = res.json()
    except ValueError:
        payload = {"raw_response": res.text}

    if isinstance(payload, dict):
        payload.setdefault("ok", res.ok)
        payload["status_code"] = res.status_code
    else:
        payload = {"ok": res.ok, "status_code": res.status_code, "data": payload}

    if res.ok:
        save_balance(payload)

    return payload
