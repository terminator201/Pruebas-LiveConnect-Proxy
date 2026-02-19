from flask import Flask, request, jsonify, render_template

from metodos.Webhook import procesar_webhook
from metodos.Setwebhook import set_webhook
from metodos.GetWebhook import get_webhook
from metodos.Token import obtener_token
from metodos.SendMessage import send_message
from metodos.SendQuickAnswer import send_quick_answer
from metodos.SendFile import send_file
from metodos.Transfer import transfer
from metodos.Balance import get_balance
from metodos.Channels import get_channels
from Inbox.conversations import get_conversations
from Inbox.messages import get_messages
from DB.database import init_db
init_db()

app = Flask(__name__)

def _status_from_result(result):
    if isinstance(result, dict):
        status = result.get("status_code")
        if isinstance(status, int):
            return status
        if result.get("ok") is False:
            return 502
    return 200

@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")

@app.route("/conversations", methods=["GET"])
def api_get_conversations():
    return jsonify(get_conversations())

@app.route("/config/setWebhook", methods=["POST"])
def config_set_webhook():
    payload = request.get_json(silent=True) or {}
    result = set_webhook(payload)
    return jsonify(result), _status_from_result(result)

@app.route("/config/getWebhook", methods=["POST"])
def config_get_webhook():
    payload = request.get_json(silent=True) or {}
    id_canal = payload.get("id_canal")
    if id_canal is None:
        return jsonify({"ok": False, "error": "id_canal es requerido"}), 400
    result = get_webhook(id_canal)
    return jsonify(result), _status_from_result(result)

@app.route("/config/balance", methods=["GET"])
def config_balance():
    result = get_balance()
    return jsonify(result), _status_from_result(result)

@app.route("/config/channels", methods=["GET"])
def config_channels():
    filters = request.args.to_dict()
    result = get_channels(filters)
    return jsonify(result), _status_from_result(result)

@app.route("/messages/<conversation_id>", methods=["GET"])
def api_get_messages(conversation_id):
    return jsonify(get_messages(conversation_id))

@app.route("/webhook/liveconnect", methods=["POST"])
def webhook():
    result = procesar_webhook(request.get_json(silent=True))
    status_code = 200 if result.get("ok", result.get("status") == "ok") else 400
    return jsonify(result), status_code

@app.route("/setWebhook", methods=["POST"])
def api_set_webhook():
    payload = request.get_json(silent=True) or {}
    result = set_webhook(payload)
    return jsonify(result), _status_from_result(result)

@app.route("/getWebhook", methods=["POST"])
def api_get_webhook():
    payload = request.get_json(silent=True) or {}
    id_canal = payload.get("id_canal")
    if id_canal is None:
        return jsonify({"ok": False, "error": "id_canal es requerido"}), 400
    result = get_webhook(id_canal)
    return jsonify(result), _status_from_result(result)

@app.route("/sendMessage", methods=["POST"])
def api_send_message():
    return jsonify(send_message(request.json))

@app.route("/sendQuickAnswer", methods=["POST"])
def api_send_quick_answer():
    return jsonify(send_quick_answer(request.json))

@app.route("/sendFile", methods=["POST"])
def api_send_file():
    return jsonify(send_file(request.json))

@app.route("/transfer", methods=["POST"])
def api_transfer():
    return jsonify(transfer(request.json))

@app.route("/balance", methods=["GET"])
def api_balance():
    result = get_balance()
    return jsonify(result), _status_from_result(result)

if __name__ == "__main__":
    app.run(port=3000)
