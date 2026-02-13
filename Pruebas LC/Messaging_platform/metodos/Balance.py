import requests
from metodos.Token import obtener_token
from DB.database import save_balance

def get_balance():
    token = obtener_token()
    headers = {"PageGearToken": token}

    res = requests.get(
        "https://api.liveconnect.chat/prod/proxy/balance",
        headers=headers
    )

    data = res.json()

    # 🔹 Guardar balance en DB
    save_balance(data)

    return data