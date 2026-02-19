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
  webhookCheckSummary: document.getElementById("webhookCheckSummary"),
  webhookResult: document.getElementById("webhookResult"),
  configStatus: document.getElementById("configStatus"),
  balanceDisplay: document.getElementById("balanceDisplay"),
  fileComposer: document.getElementById("fileComposer"),
  imageModal: document.getElementById("imageModal"),
  imageModalImage: document.getElementById("imageModalImage"),
  imageModalOpenLink: document.getElementById("imageModalOpenLink"),
  imageModalCloseBtn: document.getElementById("imageModalCloseBtn"),
  chatFileUrl: document.getElementById("chatFileUrl"),
  chatFileName: document.getElementById("chatFileName"),
  chatFileExtension: document.getElementById("chatFileExtension"),
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

function findFieldDeep(node, candidateKeys, depth = 0) {
  if (depth > 8 || node === null || node === undefined) return undefined;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFieldDeep(item, candidateKeys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  if (typeof node !== "object") return undefined;

  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      return node[key];
    }
  }

  for (const value of Object.values(node)) {
    const found = findFieldDeep(value, candidateKeys, depth + 1);
    if (found !== undefined) return found;
  }

  return undefined;
}

function resolveWebhookState(rawState, rawMessage, url) {
  if (typeof rawState === "boolean") {
    return rawState ? "activo" : "inactivo";
  }
  if (typeof rawState === "number") {
    return rawState === 1 ? "activo" : "inactivo";
  }

  const stateText = normalizeText(rawState).toLowerCase();
  if (stateText) {
    if (stateText.includes("eliminad")) return "eliminado";
    if (["1", "true", "on", "activo", "active", "enabled", "habilitado"].includes(stateText)) {
      return "activo";
    }
    if (["0", "false", "off", "inactivo", "inactive", "disabled", "deshabilitado"].includes(stateText)) {
      return "inactivo";
    }
  }

  const messageText = normalizeText(rawMessage).toLowerCase();
  if (messageText.includes("eliminad")) return "eliminado";
  if (!normalizeText(url) && messageText.includes("sin webhook")) return "inactivo";

  return "desconocido";
}

function extractWebhookSummary(payload) {
  const rawState = findFieldDeep(payload, [
    "estado",
    "status",
    "active",
    "activo",
    "enabled",
    "is_active",
    "webhook_status"
  ]);
  const rawUrl = findFieldDeep(payload, [
    "url",
    "webhook_url",
    "webhookUrl",
    "callback_url",
    "uri"
  ]);
  const rawMessage = findFieldDeep(payload, [
    "mensaje",
    "message",
    "detalle",
    "detail",
    "descripcion",
    "description",
    "error"
  ]);

  const url = normalizeText(rawUrl);
  const message = normalizeText(rawMessage);
  const estado = resolveWebhookState(rawState, rawMessage, rawUrl);

  return {
    estado,
    url: url || "(sin URL configurada)",
    mensaje: message || "(sin mensaje de API)"
  };
}

function renderWebhookCheckSummary(summary) {
  if (!dom.webhookCheckSummary || !summary) return;
  dom.webhookCheckSummary.innerText = [
    `Estado actual: ${summary.estado}`,
    `URL configurada: ${summary.url}`,
    `Mensaje API: ${summary.mensaje}`
  ].join("\n");
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

function normalizeText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function parseFileMessage(rawMessage) {
  const normalized = normalizeText(rawMessage);
  if (!normalized.startsWith("[FILE]|")) return null;

  const parts = normalized.split("|");
  const url = normalizeText(parts[1]);
  if (!url) return null;

  const name = normalizeText(parts[2] || "");
  const extension = normalizeFileExtension(parts[3] || "");

  return { url, name, extension };
}

function normalizeMetadata(value) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_error) {
      return { raw: trimmed };
    }
    return { raw: trimmed };
  }
  return null;
}

function extractUrls(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const matches = normalized.match(/https?:\/\/[^\s]+/gi) || [];
  const unique = [];
  matches.forEach((url) => {
    const clean = String(url).trim().replace(/[),.;!?]+$/g, "");
    if (clean && !unique.includes(clean)) unique.push(clean);
  });
  return unique;
}

function getUrlExtension(url) {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/");
    const lastPart = segments[segments.length - 1] || "";
    const dotIndex = lastPart.lastIndexOf(".");
    if (dotIndex === -1) return "";
    return normalizeFileExtension(lastPart.slice(dotIndex + 1));
  } catch (_error) {
    return "";
  }
}

function inferFileUrlFromUrls(urls) {
  for (const url of urls) {
    const extension = getUrlExtension(url);
    if (extension && ALLOWED_FILE_EXTENSIONS.includes(extension)) {
      return url;
    }
  }
  return "";
}

function removeUrlFromText(text, url) {
  const normalizedText = normalizeText(text);
  const normalizedUrl = normalizeText(url);
  if (!normalizedText || !normalizedUrl) return normalizedText;
  const escaped = normalizedUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizedText
    .replace(new RegExp(escaped, "g"), "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isImageExtension(extension) {
  return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(extension);
}

function openImageModal(url) {
  if (!dom.imageModal || !dom.imageModalImage || !dom.imageModalOpenLink) return;
  if (!url) return;

  dom.imageModalImage.src = url;
  dom.imageModalOpenLink.href = url;
  dom.imageModal.removeAttribute("hidden");
  dom.imageModal.style.display = "flex";
}

function closeImageModal() {
  if (!dom.imageModal || !dom.imageModalImage || !dom.imageModalOpenLink) return;
  dom.imageModal.setAttribute("hidden", "hidden");
  dom.imageModal.style.display = "none";
  dom.imageModalImage.src = "";
  dom.imageModalOpenLink.href = "#";
}

function appendTextWithLinks(container, text) {
  const normalized = normalizeText(text);
  if (!normalized) return;

  const regex = /https?:\/\/[^\s]+/gi;
  let currentIndex = 0;

  for (const match of normalized.matchAll(regex)) {
    const matchedText = match[0];
    const startIndex = match.index || 0;
    const rawUrl = matchedText.replace(/[),.;!?]+$/g, "");

    if (startIndex > currentIndex) {
      container.appendChild(document.createTextNode(normalized.slice(currentIndex, startIndex)));
    }

    const link = document.createElement("a");
    link.href = rawUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerText = rawUrl;
    link.style.color = "#0369a1";
    link.style.wordBreak = "break-all";
    container.appendChild(link);

    currentIndex = startIndex + matchedText.length;
  }

  if (currentIndex < normalized.length) {
    container.appendChild(document.createTextNode(normalized.slice(currentIndex)));
  }
}

function buildLinkPreview(url) {
  const card = document.createElement("div");
  card.style.marginTop = "8px";
  card.style.padding = "8px 10px";
  card.style.border = "1px solid #cbd5e1";
  card.style.borderRadius = "10px";
  card.style.background = "rgba(255,255,255,0.75)";

  const label = document.createElement("div");
  label.innerText = "Enlace";
  label.style.fontSize = "12px";
  label.style.fontWeight = "700";
  label.style.color = "#334155";

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerText = url;
  link.style.display = "block";
  link.style.marginTop = "4px";
  link.style.color = "#0369a1";
  link.style.wordBreak = "break-all";

  card.appendChild(label);
  card.appendChild(link);
  return card;
}

function buildFilePreview({ fileUrl, fileName, fileExt }) {
  const card = document.createElement("div");
  card.style.marginTop = "8px";
  card.style.padding = "10px";
  card.style.border = "1px solid #cbd5e1";
  card.style.borderRadius = "10px";
  card.style.background = "rgba(255,255,255,0.8)";
  card.style.display = "grid";
  card.style.gap = "8px";

  const title = document.createElement("div");
  title.innerText = fileName || "Archivo compartido";
  title.style.fontWeight = "700";
  title.style.color = "#0f172a";
  title.style.wordBreak = "break-word";
  card.appendChild(title);

  const resolvedExtension = normalizeFileExtension(fileExt || getUrlExtension(fileUrl));
  const isImage = fileUrl && isImageExtension(resolvedExtension);

  if (fileUrl) {
    const urlLink = document.createElement("a");
    urlLink.href = fileUrl;
    urlLink.target = "_blank";
    urlLink.rel = "noopener noreferrer";
    urlLink.innerText = fileUrl;
    urlLink.style.color = "#0369a1";
    urlLink.style.wordBreak = "break-all";
    urlLink.style.fontSize = "12px";
    if (isImage) {
      urlLink.addEventListener("click", (event) => {
        event.preventDefault();
        openImageModal(fileUrl);
      });
    }
    card.appendChild(urlLink);

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "8px";

    if (isImage) {
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.innerText = "Abrir archivo";
      openButton.style.background = "#dbeafe";
      openButton.style.color = "#1e3a8a";
      openButton.style.padding = "6px 10px";
      openButton.style.borderRadius = "8px";
      openButton.style.fontWeight = "600";
      openButton.addEventListener("click", () => openImageModal(fileUrl));
      actions.appendChild(openButton);
    }

    const downloadLink = document.createElement("a");
    downloadLink.href = fileUrl;
    downloadLink.target = "_blank";
    downloadLink.rel = "noopener noreferrer";
    downloadLink.innerText = "Descargar archivo";
    downloadLink.style.display = "inline-block";
    downloadLink.style.padding = "6px 10px";
    downloadLink.style.borderRadius = "8px";
    downloadLink.style.background = "#e0f2fe";
    downloadLink.style.color = "#075985";
    downloadLink.style.textDecoration = "none";
    downloadLink.style.fontWeight = "600";
    actions.appendChild(downloadLink);

    card.appendChild(actions);
  }

  return card;
}

function buildMetadataPreview(metadata) {
  if (!metadata || typeof metadata !== "object") return null;

  const details = document.createElement("details");
  details.style.marginTop = "8px";
  details.style.border = "1px dashed #94a3b8";
  details.style.borderRadius = "8px";
  details.style.padding = "6px 8px";
  details.style.background = "rgba(248,250,252,0.8)";

  const summary = document.createElement("summary");
  summary.innerText = "Metadata";
  summary.style.cursor = "pointer";
  summary.style.fontWeight = "600";
  summary.style.color = "#334155";

  const pre = document.createElement("pre");
  pre.style.margin = "8px 0 0";
  pre.style.fontSize = "11px";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.wordBreak = "break-word";
  pre.style.color = "#0f172a";

  const metadataText = JSON.stringify(metadata, null, 2);
  pre.innerText = metadataText.length > 2000 ? `${metadataText.slice(0, 2000)}\n...` : metadataText;

  details.appendChild(summary);
  details.appendChild(pre);
  return details;
}

function renderMessageBubble(item, messageItem) {
  const rawMessageText = normalizeText(messageItem?.message);
  const parsedFileMessage = parseFileMessage(rawMessageText);

  let messageText = rawMessageText;
  let fileUrl = normalizeText(messageItem?.file_url);
  let fileName = normalizeText(messageItem?.file_name);
  let fileExt = normalizeFileExtension(messageItem?.file_ext || "");

  if (parsedFileMessage) {
    fileUrl = parsedFileMessage.url || fileUrl;
    fileName = parsedFileMessage.name || fileName;
    fileExt = parsedFileMessage.extension || fileExt;
    messageText = "";
  }

  const urls = extractUrls(messageText);
  const detectedFileUrl = inferFileUrlFromUrls(urls);
  if (!fileUrl && detectedFileUrl) {
    fileUrl = detectedFileUrl;
  }
  if (!fileExt) {
    fileExt = normalizeFileExtension(getUrlExtension(fileUrl));
  }

  const metadata = normalizeMetadata(messageItem?.metadata);

  let messageType = normalizeText(messageItem?.message_type || "text").toLowerCase();
  if (!["text", "file", "link", "structured"].includes(messageType)) {
    messageType = "text";
  }
  if (messageType === "text" && fileUrl) messageType = "file";
  if (messageType === "text" && urls.length > 0) messageType = "link";
  if (messageType === "text" && metadata && Object.keys(metadata).length > 0) {
    messageType = "structured";
  }

  let displayText = messageText;
  if (fileUrl) {
    displayText = removeUrlFromText(displayText, fileUrl);
  }

  if (displayText) {
    const textNode = document.createElement("div");
    textNode.style.whiteSpace = "pre-wrap";
    textNode.style.wordBreak = "break-word";
    appendTextWithLinks(textNode, displayText);
    item.appendChild(textNode);
  }

  if (messageType === "link") {
    urls.slice(0, 2).forEach((url) => item.appendChild(buildLinkPreview(url)));
  }

  if (fileUrl) {
    item.appendChild(buildFilePreview({ fileUrl, fileName, fileExt }));
  }

  const metadataNode = buildMetadataPreview(metadata);
  if (metadataNode) {
    item.appendChild(metadataNode);
  }
}

function renderMessageList(messages) {
  if (!dom.messages) return;

  dom.messages.innerHTML = "";
  const fragment = document.createDocumentFragment();

  messages.forEach((messageItem) => {
    const item = document.createElement("div");
    item.className = `msg ${messageItem.sender === "usuario" ? "user" : "agent"}`;
    item.style.display = "flex";
    item.style.flexDirection = "column";
    item.style.gap = "2px";
    renderMessageBubble(item, messageItem);
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

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function inferExtensionFromUrl(url) {
  const extension = getUrlExtension(url);
  if (!extension) return "";
  return ALLOWED_FILE_EXTENSIONS.includes(extension) ? extension : "";
}

function pickFirstFilled(values) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function getFileFormValues() {
  const url = pickFirstFilled([dom.chatFileUrl?.value, dom.fileUrl?.value]);
  const nombre = pickFirstFilled([dom.chatFileName?.value, dom.fileName?.value]);
  const manualExtension = normalizeFileExtension(
    pickFirstFilled([dom.chatFileExtension?.value, dom.fileExtension?.value])
  );
  const extension = manualExtension || inferExtensionFromUrl(url);

  return { url, nombre, extension };
}

function clearFileFormValues() {
  if (dom.chatFileUrl) dom.chatFileUrl.value = "";
  if (dom.chatFileName) dom.chatFileName.value = "";
  if (dom.chatFileExtension) dom.chatFileExtension.value = "";
  if (dom.fileUrl) dom.fileUrl.value = "";
  if (dom.fileName) dom.fileName.value = "";
  if (dom.fileExtension) dom.fileExtension.value = "";
}

function toggleFileComposer() {
  if (!dom.fileComposer) return;
  const isHidden = dom.fileComposer.hasAttribute("hidden");
  if (isHidden) {
    dom.fileComposer.removeAttribute("hidden");
    if (dom.chatFileUrl) dom.chatFileUrl.focus();
    return;
  }
  dom.fileComposer.setAttribute("hidden", "hidden");
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
      message: normalizeText(messageItem?.message),
      message_type: normalizeText(messageItem?.message_type || "text"),
      file_url: normalizeText(messageItem?.file_url),
      file_name: normalizeText(messageItem?.file_name),
      file_ext: normalizeFileExtension(messageItem?.file_ext || ""),
      metadata: normalizeMetadata(messageItem?.metadata)
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

  const { url, nombre, extension } = getFileFormValues();

  if (!url) {
    renderConfigStatus("Debes ingresar la URL del archivo.", true);
    return;
  }
  if (!isValidHttpUrl(url)) {
    renderConfigStatus("La URL del archivo debe iniciar con http:// o https://", true);
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

  clearFileFormValues();
  if (dom.fileComposer) dom.fileComposer.setAttribute("hidden", "hidden");
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
    const summary = extractWebhookSummary(data || {});

    renderConfigStatus(
      ok ? `Consulta completada: webhook ${summary.estado}.` : "La consulta de webhook devolvio error.",
      !ok
    );

    renderWebhookCheckSummary(summary);
    writeWebhookResult(data);
  } catch (error) {
    renderWebhookCheckSummary({
      estado: "error",
      url: "(sin URL configurada)",
      mensaje: `Error de red: ${error.message}`
    });
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
  closeImageModal,
  loadChannels,
  activateWebhook,
  deactivateWebhook,
  checkWebhook,
  consultBalance,
  checkBalance,
  toggleFileComposer,
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

function onImageModalClick(event) {
  if (!dom.imageModal) return;
  if (event.target === dom.imageModal) {
    closeImageModal();
  }
}

function onDocumentKeyDown(event) {
  if (event.key === "Escape") {
    closeImageModal();
  }
}

function bindEvents() {
  document.addEventListener("click", onActionClick);
  document.addEventListener("keydown", onDocumentKeyDown);

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

  if (dom.imageModal) {
    dom.imageModal.addEventListener("click", onImageModalClick);
  }

  if (dom.imageModalCloseBtn) {
    dom.imageModalCloseBtn.addEventListener("click", closeImageModal);
  }
}

function initApp() {
  closeImageModal();
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
