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
from Inbox.conversations import get_conversations
from Inbox.messages import get_messages
from DB.database import init_db
init_db()

app = Flask(__name__)

@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")

@app.route("/conversations", methods=["GET"])
def api_get_conversations():
    return jsonify(get_conversations())

@app.route("/config/setWebhook", methods=["POST"])
def config_set_webhook():
    return jsonify(set_webhook(request.json))

@app.route("/config/getWebhook", methods=["POST"])
def config_get_webhook():
    return jsonify(get_webhook(request.json["id_canal"]))

@app.route("/config/balance", methods=["GET"])
def config_balance():
    return jsonify(get_balance())

@app.route("/messages/<conversation_id>", methods=["GET"])
def api_get_messages(conversation_id):
    return jsonify(get_messages(conversation_id))

@app.route("/webhook/liveconnect", methods=["POST"])
def webhook():
    return jsonify(procesar_webhook(request.json)), 200

@app.route("/setWebhook", methods=["POST"])
def api_set_webhook():
    return jsonify(set_webhook(request.json))

@app.route("/getWebhook", methods=["POST"])
def api_get_webhook():
    return jsonify(get_webhook(request.json["id_canal"]))

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
    return jsonify(get_balance())

if __name__ == "__main__":
    app.run(port=3000)
