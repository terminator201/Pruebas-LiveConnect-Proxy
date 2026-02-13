let currentConversation = null;
const CHANNEL_TYPES = {
  1: "WhatsApp QR",
  2: "Sitio Web",
  3: "Facebook",
  4: "Instagram",
  5: "Telegram",
  6: "Email",
  7: "WhatsApp Business API",
  8: "LinkedIn",
  9: "Google My Business"
};

function renderConfigStatus(text, isError = false) {
  const statusEl = document.getElementById("configStatus");
  if (!statusEl) return;
  statusEl.innerText = text;
  statusEl.className = isError ? "error" : "ok";
}

function getBalanceValue(payload) {
  if (!payload || typeof payload !== "object") return null;

  const direct = payload.balance;
  if (typeof direct === "number") return direct;

  if (payload.data && typeof payload.data.balance === "number") {
    return payload.data.balance;
  }

  if (
    payload.result &&
    payload.result.data &&
    typeof payload.result.data.balance === "number"
  ) {
    return payload.result.data.balance;
  }

  return null;
}

function getChannelTypeLabel(tipo) {
  return CHANNEL_TYPES[tipo] || `Tipo ${tipo}`;
}

async function loadChannels() {
  const select = document.getElementById("channelSelect");
  const canalInput = document.getElementById("canalId");
  if (!select || !canalInput) return;

  select.innerHTML = '<option value="">Cargando canales...</option>';

  try {
    const res = await fetch("/config/channels?visible=1");
    const data = await res.json();
    const channels = Array.isArray(data.data) ? data.data : [];
    const ok = res.ok && data.ok !== false;

    if (!ok) {
      select.innerHTML = '<option value="">Error cargando canales</option>';
      renderConfigStatus("No se pudieron cargar los canales.", true);
      return;
    }

    if (channels.length === 0) {
      select.innerHTML = '<option value="">No hay canales disponibles</option>';
      renderConfigStatus("No hay canales visibles para configurar webhook.", true);
      return;
    }

    select.innerHTML = '<option value="">Selecciona un canal</option>';
    channels.forEach(channel => {
      const option = document.createElement("option");
      option.value = String(channel.id);
      option.innerText = `#${channel.id} - ${getChannelTypeLabel(channel.tipo)} - ${channel.uid || "sin uid"} - ${channel.estado === 1 ? "activo" : "inactivo"}`;
      select.appendChild(option);
    });

    renderConfigStatus("Canales cargados correctamente.");
  } catch (e) {
    select.innerHTML = '<option value="">Error de red</option>';
    renderConfigStatus(`Error de red al cargar canales: ${e.message}`, true);
  }
}

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
  const balance = getBalanceValue(data);

  if (balance === null) {
    alert("No fue posible interpretar el saldo. Revisa el panel de configuración.");
    return;
  }

  alert(`Saldo disponible: $${balance}`);
}

/* =========================
   Configuraciones
========================= */

/* Activar Webhook */
async function applyWebhook() {
  const channelSelect = document.getElementById("channelSelect");
  const id_canal = parseInt(channelSelect?.value || document.getElementById("canalId").value);
  const url = document.getElementById("webhookUrl").value;
  const secret = document.getElementById("secret").value;
  const resultEl = document.getElementById("webhookResult");

  if (!id_canal || !url || !secret) {
    renderConfigStatus("Debes completar ID canal, URL y secret.", true);
    return;
  }

  try {
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
    const ok = res.ok && data.ok !== false;

    renderConfigStatus(
      ok ? "Webhook configurado correctamente." : "Falló la configuración del webhook.",
      !ok
    );
    if (resultEl) resultEl.innerText = JSON.stringify(data, null, 2);
  } catch (e) {
    renderConfigStatus(`Error de red: ${e.message}`, true);
  }
}

/* Consultar Webhook */
async function checkWebhook() {
  const channelSelect = document.getElementById("channelSelect");
  const id_canal = parseInt(channelSelect?.value || document.getElementById("canalId").value);
  const resultEl = document.getElementById("webhookResult");

  if (!id_canal) {
    renderConfigStatus("Debes ingresar un ID de canal válido.", true);
    return;
  }

  try {
    const res = await fetch("/config/getWebhook", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({ id_canal })
    });

    const data = await res.json();
    const ok = res.ok && data.ok !== false;

    renderConfigStatus(
      ok ? "Consulta de webhook completada." : "La consulta de webhook devolvió error.",
      !ok
    );
    if (resultEl) resultEl.innerText = JSON.stringify(data, null, 2);
  } catch (e) {
    renderConfigStatus(`Error de red: ${e.message}`, true);
  }
}

/* Consultar Balance */
async function consultBalance() {
  try {
    const res = await fetch("/config/balance");
    const data = await res.json();
    const balance = getBalanceValue(data);
    const display = document.getElementById("balanceDisplay");
    const ok = res.ok && data.ok !== false;

    if (!display) return;

    if (balance === null) {
      display.innerText = "No se pudo obtener un valor de saldo válido.";
      renderConfigStatus("No se pudo interpretar el balance de la API.", true);
      return;
    }

    display.innerText = `Saldo actual: $${balance}`;
    renderConfigStatus(
      ok ? "Balance consultado correctamente." : "Balance consultado con advertencias.",
      !ok
    );
  } catch (e) {
    document.getElementById("balanceDisplay").innerText = "Error de red consultando balance.";
    renderConfigStatus(`Error de red: ${e.message}`, true);
  }
}

/* =========================
   INIT
========================= */

loadConversations();
setInterval(loadConversations, 5000);

const channelSelect = document.getElementById("channelSelect");
if (channelSelect) {
  channelSelect.addEventListener("change", (event) => {
    const canalInput = document.getElementById("canalId");
    if (!canalInput) return;
    canalInput.value = event.target.value || "";
  });
}

function openSettings() {
  document.getElementById("settingsPanel").style.display = "block";
  loadChannels();
}

function closeSettings() {
  document.getElementById("settingsPanel").style.display = "none";
}

window.onclick = function(event) {
  const modal = document.getElementById("settingsPanel");
  if (event.target === modal) {
    closeSettings();
  }
}
