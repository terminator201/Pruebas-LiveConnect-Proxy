const APP_CONFIG = Object.freeze({
  conversationsPollMs: 5000,
  messagesPollMs: 2000,
  defaultTransferChannelId: 3918,
  currencyLocale: "es-CO"
});

const CHANNEL_TYPES = Object.freeze({
  1: "WhatsApp QR",
  2: "Sitio Web",
  3: "Facebook",
  4: "Instagram",
  5: "Telegram",
  6: "Email",
  7: "WhatsApp Business API",
  8: "LinkedIn",
  9: "Google My Business"
});

const ALLOWED_FILE_EXTENSIONS = Object.freeze([
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt"
]);

const UI_TEXT = Object.freeze({
  invalidConversation: "Selecciona una conversacion primero.",
  invalidBalance: "No fue posible interpretar el saldo. Revisa el panel de configuracion.",
  transferSuccess: "Conversacion transferida a LiveConnect",
  transferError: "No se pudo transferir la conversacion."
});

const state = {
  currentConversation: null
};

const dom = {
  sidebar: document.getElementById("sidebar"),
  messages: document.getElementById("messages"),
  messageInput: document.getElementById("messageInput"),
  settingsPanel: document.getElementById("settingsPanel"),
  channelSelect: document.getElementById("channelSelect"),
  canalId: document.getElementById("canalId"),
  webhookUrl: document.getElementById("webhookUrl"),
  secret: document.getElementById("secret"),
  webhookResult: document.getElementById("webhookResult"),
  configStatus: document.getElementById("configStatus"),
  balanceDisplay: document.getElementById("balanceDisplay"),
  fileUrl: document.getElementById("fileUrl"),
  fileName: document.getElementById("fileName"),
  fileExtension: document.getElementById("fileExtension"),
  quickAnswerId: document.getElementById("quickAnswerId"),
  quickAnswerVariables: document.getElementById("quickAnswerVariables")
};

function renderConfigStatus(text, isError = false) {
  if (!dom.configStatus) return;
  dom.configStatus.innerText = text;
  dom.configStatus.className = isError ? "error" : "ok";
}

function writeWebhookResult(data) {
  if (!dom.webhookResult) return;
  dom.webhookResult.innerText = JSON.stringify(data, null, 2);
}

function isApiSuccess(res, data) {
  return Boolean(res?.ok) && data?.ok !== false;
}

async function requestJSON(url, options = {}) {
  const res = await fetch(url, options);
  let data = null;
  try {
    data = await res.json();
  } catch (_error) {
    data = null;
  }
  return { res, data };
}

function postJSON(url, payload) {
  return requestJSON(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

function toNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=.*\.)/g, "")
    .replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function findAmountDeep(node, depth = 0) {
  if (depth > 8 || node === null || node === undefined) return null;

  const direct = toNumeric(node);
  if (direct !== null) return direct;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findAmountDeep(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  if (typeof node !== "object") return null;

  const preferredKeys = ["balance", "saldo", "available_balance", "amount"];
  for (const key of preferredKeys) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      const found = findAmountDeep(node[key], depth + 1);
      if (found !== null) return found;
    }
  }

  for (const value of Object.values(node)) {
    const found = findAmountDeep(value, depth + 1);
    if (found !== null) return found;
  }

  return null;
}

function getBalanceValue(payload) {
  return findAmountDeep(payload);
}

function getChannelTypeLabel(tipo) {
  return CHANNEL_TYPES[tipo] || `Tipo ${tipo}`;
}

function getSelectedChannelId() {
  const selectValue = dom.channelSelect?.value?.trim();
  const manualValue = dom.canalId?.value?.trim();
  const rawValue = selectValue || manualValue;

  if (!rawValue) return null;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureCurrentConversation() {
  if (!state.currentConversation) {
    alert(UI_TEXT.invalidConversation);
    return null;
  }

  return state.currentConversation;
}

function renderConversationList(conversations) {
  if (!dom.sidebar) return;

  dom.sidebar.innerHTML = "";
  const fragment = document.createDocumentFragment();

  conversations.forEach((conversation) => {
    const item = document.createElement("div");
    item.className = "conversation";
    if (conversation.id === state.currentConversation) {
      item.classList.add("active");
    }
    item.dataset.conversationId = conversation.id;
    item.innerText = conversation.id;
    fragment.appendChild(item);
  });

  dom.sidebar.appendChild(fragment);
}

function renderMessageList(messages) {
  if (!dom.messages) return;

  dom.messages.innerHTML = "";
  const fragment = document.createDocumentFragment();

  messages.forEach((messageItem) => {
    const item = document.createElement("div");
    item.className = `msg ${messageItem.sender === "usuario" ? "user" : "agent"}`;
    item.innerText = messageItem.message;
    fragment.appendChild(item);
  });

  dom.messages.appendChild(fragment);
  dom.messages.scrollTop = dom.messages.scrollHeight;
}

function parseVariablesJSON(rawValue) {
  const trimmed = String(rawValue || "").trim();
  if (!trimmed) return {};

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (_error) {
    throw new Error("El JSON de variables no es valido.");
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Las variables deben ser un objeto JSON.");
  }

  return parsed;
}

function normalizeFileExtension(value) {
  return String(value || "").trim().toLowerCase().replace(/^\./, "");
}

async function loadChannels() {
  if (!dom.channelSelect || !dom.canalId) return;

  dom.channelSelect.innerHTML = '<option value="">Cargando canales...</option>';

  try {
    const { res, data } = await requestJSON("/config/channels?visible=1");
    const channels = Array.isArray(data?.data) ? data.data : [];

    if (!isApiSuccess(res, data)) {
      dom.channelSelect.innerHTML = '<option value="">Error cargando canales</option>';
      renderConfigStatus("No se pudieron cargar los canales.", true);
      return;
    }

    if (channels.length === 0) {
      dom.channelSelect.innerHTML = '<option value="">No hay canales disponibles</option>';
      renderConfigStatus("No hay canales visibles para configurar webhook.", true);
      return;
    }

    dom.channelSelect.innerHTML = '<option value="">Selecciona un canal</option>';
    channels.forEach((channel) => {
      const option = document.createElement("option");
      option.value = String(channel.id);
      option.innerText = `#${channel.id} - ${getChannelTypeLabel(channel.tipo)} - ${channel.uid || "sin uid"} - ${channel.estado === 1 ? "activo" : "inactivo"}`;
      dom.channelSelect.appendChild(option);
    });

    renderConfigStatus("Canales cargados correctamente.");
  } catch (error) {
    dom.channelSelect.innerHTML = '<option value="">Error de red</option>';
    renderConfigStatus(`Error de red al cargar canales: ${error.message}`, true);
  }
}

async function loadConversations() {
  if (!dom.sidebar) return;

  try {
    const { data } = await requestJSON("/conversations");
    const conversations = Array.isArray(data) ? data : [];
    renderConversationList(conversations);
  } catch (_error) {
    dom.sidebar.innerHTML = '<div class="conversation">Error cargando conversaciones</div>';
  }
}

async function selectConversation(conversationId, element) {
  state.currentConversation = conversationId;

  document.querySelectorAll(".conversation").forEach((item) => item.classList.remove("active"));
  if (element) {
    element.classList.add("active");
  }

  await loadMessages(conversationId);
}

async function loadMessages(conversationId) {
  if (!dom.messages) return;

  try {
    const encodedId = encodeURIComponent(conversationId);
    const { data } = await requestJSON(`/messages/${encodedId}`);
    const messages = Array.isArray(data) ? data : [];

    const normalizedMessages = messages.map((messageItem) => ({
      sender: messageItem?.sender === "usuario" ? "usuario" : "agent",
      message: String(messageItem?.message || "")
    }));

    renderMessageList(normalizedMessages);
  } catch (_error) {
    dom.messages.innerHTML = "";
  }
}

async function sendMessage() {
  const conversationId = ensureCurrentConversation();
  if (!conversationId || !dom.messageInput) return;

  const message = dom.messageInput.value.trim();
  if (!message) return;

  const payload = {
    id_conversacion: conversationId,
    mensaje: message
  };

  const { res, data } = await postJSON("/sendMessage", payload);
  if (!isApiSuccess(res, data)) {
    renderConfigStatus("No se pudo enviar el mensaje.", true);
    writeWebhookResult(data);
    return;
  }

  dom.messageInput.value = "";
  renderConfigStatus("Mensaje enviado correctamente.");
  writeWebhookResult(data);
  await loadMessages(conversationId);
}

async function sendQuickAnswer() {
  const conversationId = ensureCurrentConversation();
  if (!conversationId) return;

  const rawQuickAnswerId = dom.quickAnswerId?.value?.trim();
  if (!rawQuickAnswerId) {
    renderConfigStatus("Debes ingresar el ID de respuesta para QuickAnswer.", true);
    return;
  }

  const idRespuesta = Number.parseInt(rawQuickAnswerId, 10);
  if (!Number.isFinite(idRespuesta)) {
    renderConfigStatus("El ID de respuesta debe ser numerico.", true);
    return;
  }

  let variables;
  try {
    variables = parseVariablesJSON(dom.quickAnswerVariables?.value || "{}");
  } catch (error) {
    renderConfigStatus(error.message, true);
    return;
  }

  const payload = {
    id_conversacion: conversationId,
    id_respuesta: idRespuesta,
    variables
  };

  const { res, data } = await postJSON("/sendQuickAnswer", payload);
  if (!isApiSuccess(res, data)) {
    renderConfigStatus("No se pudo enviar el QuickAnswer.", true);
    writeWebhookResult(data);
    return;
  }

  renderConfigStatus("QuickAnswer enviado correctamente.");
  writeWebhookResult(data);
  await loadMessages(conversationId);
}

async function sendFile() {
  const conversationId = ensureCurrentConversation();
  if (!conversationId) return;

  const url = dom.fileUrl?.value?.trim() || "";
  const nombre = dom.fileName?.value?.trim() || "";
  const extension = normalizeFileExtension(dom.fileExtension?.value || "");

  if (!url) {
    renderConfigStatus("Debes ingresar la URL del archivo.", true);
    return;
  }
  if (!nombre) {
    renderConfigStatus("Debes ingresar el nombre del archivo.", true);
    return;
  }
  if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
    renderConfigStatus("Debes seleccionar una extension valida.", true);
    return;
  }

  const payload = {
    id_conversacion: conversationId,
    url,
    nombre,
    extension
  };

  const { res, data } = await postJSON("/sendFile", payload);
  if (!isApiSuccess(res, data)) {
    renderConfigStatus("No se pudo enviar el archivo.", true);
    writeWebhookResult(data);
    return;
  }

  renderConfigStatus("Archivo enviado correctamente.");
  writeWebhookResult(data);
  await loadMessages(conversationId);
}

async function transferConversation() {
  const conversationId = ensureCurrentConversation();
  if (!conversationId) return;

  const { res, data } = await postJSON("/transfer", {
    id_conversacion: conversationId,
    id_canal: APP_CONFIG.defaultTransferChannelId,
    estado: 1,
    mensaje: "Transferido desde Inbox Web"
  });

  if (!isApiSuccess(res, data)) {
    alert(UI_TEXT.transferError);
    return;
  }

  alert(UI_TEXT.transferSuccess);
}

async function checkBalance() {
  const { data } = await requestJSON("/balance");
  const balance = getBalanceValue(data);

  if (balance === null) {
    alert(UI_TEXT.invalidBalance);
    return;
  }

  alert(`Saldo disponible: $${balance}`);
}

function getWebhookFormValues() {
  const idCanal = getSelectedChannelId();
  const url = dom.webhookUrl?.value?.trim() || "";
  const secret = dom.secret?.value?.trim() || "";
  return { idCanal, url, secret };
}

function buildWebhookPayload({ idCanal, estado, url, secret }) {
  return {
    id_canal: Number.parseInt(String(idCanal), 10),
    estado: Boolean(estado),
    url,
    secret
  };
}

async function submitWebhookState(estado) {
  const { idCanal, url, secret } = getWebhookFormValues();

  if (!idCanal) {
    renderConfigStatus("Debes ingresar un ID de canal valido.", true);
    return;
  }

  if (estado === true && !url) {
    renderConfigStatus("Debes ingresar la URL del webhook para activar el proxy.", true);
    return;
  }

  const payload = buildWebhookPayload({ idCanal, estado, url, secret });

  try {
    const { res, data } = await postJSON("/config/setWebhook", payload);
    const ok = isApiSuccess(res, data);

    renderConfigStatus(
      ok
        ? (estado ? "Proxy activado correctamente." : "Proxy desactivado correctamente.")
        : (estado ? "No se pudo activar el proxy." : "No se pudo desactivar el proxy."),
      !ok
    );

    writeWebhookResult(data);
  } catch (error) {
    renderConfigStatus(`Error de red: ${error.message}`, true);
  }
}

async function activateWebhook() {
  await submitWebhookState(true);
}

async function deactivateWebhook() {
  await submitWebhookState(false);
}

async function checkWebhook() {
  const idCanal = getSelectedChannelId();

  if (!idCanal) {
    renderConfigStatus("Debes ingresar un ID de canal valido.", true);
    return;
  }

  try {
    const { res, data } = await postJSON("/config/getWebhook", { id_canal: idCanal });
    const ok = isApiSuccess(res, data);

    renderConfigStatus(
      ok ? "Consulta de webhook completada." : "La consulta de webhook devolvio error.",
      !ok
    );

    writeWebhookResult(data);
  } catch (error) {
    renderConfigStatus(`Error de red: ${error.message}`, true);
  }
}

async function consultBalance() {
  if (!dom.balanceDisplay) return;

  try {
    const { res, data } = await requestJSON("/config/balance");
    const balance = getBalanceValue(data);
    const ok = isApiSuccess(res, data);

    if (balance === null) {
      dom.balanceDisplay.innerText = "No se pudo obtener un valor de saldo valido.";
      writeWebhookResult({ balance_response: data });
      renderConfigStatus("No se pudo interpretar el balance de la API. Revisa la respuesta en el panel oscuro.", true);
      return;
    }

    dom.balanceDisplay.innerText = `Saldo actual: $${balance.toLocaleString(APP_CONFIG.currencyLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    renderConfigStatus(
      ok ? "Balance consultado correctamente." : "Balance consultado con advertencias.",
      !ok
    );
  } catch (error) {
    dom.balanceDisplay.innerText = "Error de red consultando balance.";
    renderConfigStatus(`Error de red: ${error.message}`, true);
  }
}

function openSettings() {
  if (!dom.settingsPanel) return;
  dom.settingsPanel.style.display = "block";
  loadChannels();
}

function closeSettings() {
  if (!dom.settingsPanel) return;
  dom.settingsPanel.style.display = "none";
}

const actionHandlers = Object.freeze({
  openSettings,
  closeSettings,
  loadChannels,
  activateWebhook,
  deactivateWebhook,
  checkWebhook,
  consultBalance,
  checkBalance,
  sendQuickAnswer,
  sendFile,
  transferConversation,
  sendMessage
});

function onActionClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  const handler = actionHandlers[action];
  if (!handler) return;

  event.preventDefault();
  handler();
}

function onConversationClick(event) {
  const item = event.target.closest("[data-conversation-id]");
  if (!item) return;

  const conversationId = item.dataset.conversationId;
  if (!conversationId) return;

  selectConversation(conversationId, item);
}

function onChannelSelectionChange(event) {
  if (!dom.canalId) return;
  dom.canalId.value = event.target.value || "";
}

function onMessageInputKeyDown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  sendMessage();
}

function onSettingsBackdropClick(event) {
  if (event.target === dom.settingsPanel) {
    closeSettings();
  }
}

function bindEvents() {
  document.addEventListener("click", onActionClick);

  if (dom.sidebar) {
    dom.sidebar.addEventListener("click", onConversationClick);
  }

  if (dom.channelSelect) {
    dom.channelSelect.addEventListener("change", onChannelSelectionChange);
  }

  if (dom.messageInput) {
    dom.messageInput.addEventListener("keydown", onMessageInputKeyDown);
  }

  if (dom.settingsPanel) {
    dom.settingsPanel.addEventListener("click", onSettingsBackdropClick);
  }
}

function initApp() {
  bindEvents();
  loadConversations();
  setInterval(loadConversations, APP_CONFIG.conversationsPollMs);
  setInterval(() => {
    if (state.currentConversation) {
      loadMessages(state.currentConversation);
    }
  }, APP_CONFIG.messagesPollMs);
}

initApp();
