const log = document.getElementById("log");
const clientIdEl = document.getElementById("clientId");
const psidEl = document.getElementById("psid");
const textEl = document.getElementById("text");

function addMessage(role, text, meta) {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<div class="role">${role}</div><div class="text"></div>`;
  div.querySelector(".text").textContent = text;
  if (meta) {
    const metaDiv = document.createElement("div");
    metaDiv.className = "meta";
    metaDiv.textContent = meta;
    div.appendChild(metaDiv);
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

function addChunks(div, chunks) {
  if (!chunks || !chunks.length) return;
  const details = document.createElement("details");
  details.className = "chunks";
  const summary = document.createElement("summary");
  summary.textContent = `${chunks.length} retrieved chunk(s)`;
  details.appendChild(summary);
  const list = document.createElement("ul");
  for (const c of chunks) {
    const li = document.createElement("li");
    li.textContent = `[${(c.similarity ?? 0).toFixed?.(3) ?? c.similarity}] ${c.question} -> ${c.answer}`;
    list.appendChild(li);
  }
  details.appendChild(list);
  div.appendChild(details);
}

async function send() {
  const clientId = clientIdEl.value.trim();
  const psid = psidEl.value.trim();
  const text = textEl.value.trim();
  if (!clientId || !psid || !text) return;

  addMessage("user", text);
  textEl.value = "";

  try {
    const res = await fetch("/api/test-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, psid, text })
    });
    const data = await res.json();
    if (!res.ok) {
      addMessage("error", data.error || `Request failed (${res.status})`);
      return;
    }
    const meta = `confidence: ${data.confidence} | escalate: ${data.escalate} | retrieval: ${data.timings?.retrievalMs}ms | deepseek: ${data.timings?.deepseekMs}ms`;
    const div = addMessage("assistant", data.replyText, meta);
    addChunks(div, data.retrievedChunks);
  } catch (err) {
    addMessage("error", String(err));
  }
}

document.getElementById("send").addEventListener("click", send);
textEl.addEventListener("keydown", e => {
  if (e.key === "Enter") send();
});
