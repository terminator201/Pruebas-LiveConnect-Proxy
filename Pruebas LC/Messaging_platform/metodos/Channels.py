import requests
from metodos.Token import obtener_token

def get_channels(filters=None):
    token = obtener_token()
    headers = {
        "Accept": "application/json",
        "PageGearToken": token
    }

    clean_filters = {}
    if isinstance(filters, dict):
        for key, value in filters.items():
            if value is not None and str(value).strip() != "":
                clean_filters[key] = value

    try:
        res = requests.get(
            "https://api.liveconnect.chat/prod/channels/list",
            headers=headers,
            params=clean_filters,
            timeout=20
        )
    except requests.RequestException as e:
        return {"ok": False, "error": f"Error de red en channels/list: {str(e)}"}

    try:
        payload = res.json()
    except ValueError:
        payload = {"raw_response": res.text}

    if isinstance(payload, dict):
        payload.setdefault("ok", res.ok)
        payload["status_code"] = res.status_code
        return payload

    return {"ok": res.ok, "status_code": res.status_code, "data": payload}
