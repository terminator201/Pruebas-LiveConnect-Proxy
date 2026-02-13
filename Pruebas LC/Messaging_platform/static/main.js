let currentConversation = null;

/* =========================
   CONVERSACIONES
========================= */

async function loadConversations() {
  const res = await fetch("/conversations");
  const conversations = await res.json();

  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";

  conversations.forEach(c => {
    const div = document.createElement("div");
    div.className = "conversation";
    div.innerText = c.id;
    div.onclick = () => selectConversation(c.id, div);
    sidebar.appendChild(div);
  });
}

async function selectConversation(id, element) {
  currentConversation = id;

  document.querySelectorAll(".conversation")
    .forEach(c => c.classList.remove("active"));

  element.classList.add("active");
  loadMessages(id);
}

/* =========================
   MENSAJES
========================= */

async function loadMessages(id) {
  const res = await fetch(`/messages/${id}`);
  const messages = await res.json();

  const container = document.getElementById("messages");
  container.innerHTML = "";

  messages.forEach(m => {
    const div = document.createElement("div");
    div.className = `msg ${m.sender === "usuario" ? "user" : "agent"}`;
    div.innerText = m.message;
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
}

/* =========================
   ACCIONES
========================= */

async function sendMessage() {
  const input = document.getElementById("messageInput");
  const mensaje = input.value;

  if (!mensaje || !currentConversation) return;

  await fetch("/sendMessage", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      id_conversacion: currentConversation,
      mensaje
    })
  });

  input.value = "";
  loadMessages(currentConversation);
}

async function sendQuickAnswer(id_respuesta) {
  if (!currentConversation) return;

  await fetch("/sendQuickAnswer", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      id_conversacion: currentConversation,
      id_respuesta,
      variables: {
        "visitante.nombre": "Carolina"
      }
    })
  });

  loadMessages(currentConversation);
}

async function transferConversation() {
  if (!currentConversation) return;

  await fetch("/transfer", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      id_conversacion: currentConversation,
      id_canal: 3918,
      estado: 1,
      mensaje: "Transferido desde Inbox Web"
    })
  });

  alert("Conversación transferida a LiveConnect");
}

async function checkBalance() {
  const res = await fetch("/balance");
  const data = await res.json();
  alert(`Saldo disponible: $${data.data.balance}`);
}

/* =========================
   Configuraciones
========================= */

/* Abrir panel */
function openSettings() {
  document.getElementById("settingsPanel").style.display = "block";
}

function closeSettings() {
  document.getElementById("settingsPanel").style.display = "none";
}

window.onclick = function(event) {
  const modal = document.getElementById("settingsPanel");
  if (event.target === modal) {
    modal.style.display = "none";
  }
}

/* Activar Webhook */
async function applyWebhook() {
  const id_canal = parseInt(document.getElementById("canalId").value);
  const url = document.getElementById("webhookUrl").value;
  const secret = document.getElementById("secret").value;

  const res = await fetch("/config/setWebhook", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      id_canal,
      estado: true,
      url,
      secret
    })
  });

  const data = await res.json();
  alert("Webhook configurado");
}

/* Consultar Webhook */
async function checkWebhook() {
  const id_canal = parseInt(document.getElementById("canalId").value);

  const res = await fetch("/config/getWebhook", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ id_canal })
  });

  const data = await res.json();
  alert(JSON.stringify(data, null, 2));
}

/* Consultar Balance */
async function consultBalance() {
  const res = await fetch("/config/balance");
  const data = await res.json();

  document.getElementById("balanceDisplay").innerText =
    `Saldo actual: $${data.data.balance}`;

  // aquí puedes llamar endpoint que lo guarde en DB si quieres persistencia
}

/* =========================
   INIT
========================= */

loadConversations();
setInterval(loadConversations, 5000);
