import requests
from metodos.Token import obtener_token
from DB.database import save_balance

def get_balance(expected_idc=None):
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
        return {
            "ok": False,
            "error": "Respuesta inválida del servidor",
            "raw_response": res.text
        }

    if not res.ok:
        return {
            "ok": False,
            "status_code": res.status_code,
            "error": payload
        }

    # 🔹 Validación de estructura
    data = payload.get("data")
    if not data:
        return {"ok": False, "error": "No se encontró data en la respuesta"}

    idc = data.get("idc")
    balance = data.get("balance")

    # 🔹 Validación por número de cuenta
    if expected_idc is not None:
        if str(idc) != str(expected_idc):
            return {
                "ok": False,
                "error": f"El balance recibido pertenece al idc {idc}, no a {expected_idc}"
            }

    result = {
        "ok": True,
        "idc": idc,
        "balance": balance,
        "detail": data
    }

    save_balance(result)

    return result
