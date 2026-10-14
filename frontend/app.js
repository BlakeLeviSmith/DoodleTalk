/* DoodleTalk — Draw it. See it. Say it.  (vanilla JS, no build step) */
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (_) { return false; }
    },
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  async function api(path, body, timeoutMs = 60000) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      if (t) clearTimeout(t);
    }
  }

  let toastTimer = null;
  function toast(msg) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
  }

  const CATS = ["people", "actions", "descriptors", "food", "things", "animals", "places", "social", "feelings"];
  const normCat = (c) => (CATS.includes(c) ? c : "things");

  // ---------- Health / banner ----------
  const banner = $("#banner");
  let backendReady = false;
  let healthTimer = null;

  function showBanner(kind, text) {
    banner.className = "banner " + kind;
    banner.textContent = text;
    banner.hidden = false;
  }

  async function checkHealth() {
    clearTimeout(healthTimer);
    try {
      const h = await api("/api/health", null, 5000);
      if (h && h.models_loaded) {
        banner.hidden = true;
        if (!backendReady) { backendReady = true; onBackendReady(); }
        return;
      }
      backendReady = false;
      showBanner("warm", "Warming up the magic… (loading the picture models)");
      healthTimer = setTimeout(checkHealth, 2000);
    } catch (_) {
      backendReady = false;
      showBanner("offline", "Can't reach the DoodleTalk helper right now. You can still draw and use your board — we'll keep trying!");
      healthTimer = setTimeout(checkHealth, 5000);
    }
  }

  function onBackendReady() {

    if (strokes.length) scheduleRecognize(0);
    else if (lockedWord) requestGenerate();
  }

  // ---------- Speech ----------
  let voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    const voices = speechSynthesis.getVoices() || [];
    const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang));
    const prefs = ["Samantha", "Google US English", "Karen", "Moira", "Tessa", "Microsoft Aria", "Microsoft Jenny", "Allison", "Ava", "Serena", "Daniel"];
    for (const p of prefs) {
      const v = en.find((x) => x.name.includes(p));
      if (v) { voice = v; return; }
    }
    voice = en.find((v) => v.default) || en[0] || null;
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    try { speechSynthesis.addEventListener("voiceschanged", pickVoice); } catch (_) { speechSynthesis.onvoiceschanged = pickVoice; }
  }
  function speak(text, onEnd) {
    try {
      if (!("speechSynthesis" in window) || !text) { onEnd && onEnd(); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = (voice && voice.lang) || "en-US";
      u.rate = 0.9; u.pitch = 1.05;
      if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
      speechSynthesis.speak(u);
    } catch (_) { onEnd && onEnd(); }
  }

  // ---------- Canvas ----------
  const canvas = $("#canvas");
  const ctx = canvas.getContext("2d");
  const SIZE = 512;
  const COLORS = [
    { c: "#2b2118", n: "Black" },
    { c: "#E63946", n: "Red" },
    { c: "#FF9330", n: "Orange" },
    { c: "#F5C400", n: "Yellow" },
    { c: "#3DBE5C", n: "Green" },
    { c: "#3B8BEB", n: "Blue" },
    { c: "#9B5DE5", n: "Purple" },
  ];
  let brushColor = COLORS[0].c;
  let brushSize = 14;
  let erasing = false;
  let strokes = [];
  let current = null;
  const hint = $("#canvasHint");

  function paintBg() {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.restore();
  }

  function drawStroke(s) {
    const pts = s.points;
    if (!pts.length) return;
    ctx.strokeStyle = s.erase ? "#ffffff" : s.color;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = s.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (pts.length < 3) {
      const p = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(p.x, p.y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      if (pts.length === 2) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function redraw() {
    paintBg();
    for (const s of strokes) drawStroke(s);
    if (current) drawStroke(current);
    hint.classList.toggle("gone", strokes.length > 0 || !!current);
  }

  function toCanvasPt(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * SIZE,
      y: ((e.clientY - r.top) / r.height) * SIZE,
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    clearTimeout(recognizeTimer);
    current = { color: brushColor, size: brushSize * (erasing ? 1.8 : 1), erase: erasing, points: [toCanvasPt(e)] };
    redraw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!current) return;
    e.preventDefault();
    const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
    for (const ev of (evs.length ? evs : [e])) {
      const p = toCanvasPt(ev);
      const last = current.points[current.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) current.points.push(p);
    }
    redraw();
  });
  function endStroke() {
    if (!current) return;
    strokes.push(current);
    current = null;
    redraw();
    updateAddBtn();
    scheduleRecognize(350);
  }
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("lostpointercapture", endStroke);

  function exportPNG() { return canvas.toDataURL("image/png"); }

  // toolbar
  const colorsEl = $("#colors");
  COLORS.forEach((col, i) => {
    const b = document.createElement("button");
    b.className = "swatch";
    b.style.background = col.c;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", col.n + " brush");
    b.setAttribute("aria-checked", i === 0 ? "true" : "false");
    b.addEventListener("click", () => {
      brushColor = col.c;
      setEraser(false);
      colorsEl.querySelectorAll(".swatch").forEach((s) => s.setAttribute("aria-checked", s === b ? "true" : "false"));
    });
    colorsEl.appendChild(b);
  });
  document.querySelectorAll(".size").forEach((b) => {
    b.setAttribute("aria-checked", +b.dataset.size === brushSize ? "true" : "false");
    b.addEventListener("click", () => {
      brushSize = +b.dataset.size;
      document.querySelectorAll(".size").forEach((s) => s.setAttribute("aria-checked", s === b ? "true" : "false"));
    });
  });
  const eraserBtn = $("#eraser");
  function setEraser(on) {
    erasing = on;
    eraserBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }
  eraserBtn.addEventListener("click", () => setEraser(!erasing));
  $("#undo").addEventListener("click", () => {
    if (!strokes.length) return;
    strokes.pop();
    redraw();
    updateAddBtn();
    if (strokes.length) scheduleRecognize(350);
    else if (!lockedWord) resetMagic();
  });
  $("#clearCanvas").addEventListener("click", () => {
    strokes = [];
    current = null;
    redraw();
    epoch++;
    seed = Math.floor(Math.random() * 100000);
    lockedWord = null;
    currentWord = null;
    renderChips([]);
    resetMagic();
  });

  // ---------- Live loop (recognize → generate) ----------
  let recognizeTimer = null;
  let recogSeq = 0;
  let epoch = 0;              // bumps on clear → drops anything in flight
  let lockedWord = null;      // {word, category} if user picked a chip or typed
  let currentWord = null;     // {word, category} currently shown
  let lastLabels = [];
  let style = store.get("dt_style", "pictogram");
  let seed = 42;

  let genInFlight = false;
  let genQueued = false;
  let genSeq = 0;
  let shownSeq = 0;
  let magicImage = null;      // data URL of current preview
  let magicFor = null;        // {word, category} it was generated for

  function scheduleRecognize(delay) {
    clearTimeout(recognizeTimer);
    recognizeTimer = setTimeout(runRecognize, delay);
  }

  async function runRecognize() {
    if (!strokes.length || !backendReady) return;
    const id = ++recogSeq;
    const ep = epoch;
    let labels = [];
    try {
      const r = await api("/api/recognize", { image: exportPNG() }, 30000);
      labels = (r && Array.isArray(r.labels)) ? r.labels : [];
    } catch (_) {
      if (id === recogSeq && ep === epoch && lockedWord) requestGenerate();
      return;
    }
    if (id !== recogSeq || ep !== epoch) return; // stale
    lastLabels = labels.slice(0, 5);
    renderChips(lastLabels);
    if (!lockedWord && lastLabels.length) {
      currentWord = { word: lastLabels[0].word, category: normCat(lastLabels[0].category) };
    } else if (lockedWord) {
      currentWord = lockedWord;
    }
    if (currentWord) requestGenerate();
  }

  function buildGenPayload() {
    const w = lockedWord || currentWord;
    if (!w) return null;
    return {
      word: w.word,
      image: strokes.length ? exportPNG() : null,
      style,
      strength: 0.6,
      seed,
    };
  }

  function requestGenerate() {
    if (!backendReady) return;
    if (genInFlight) { genQueued = true; return; } // queue only the latest (payload built when it fires)
    fireGenerate();
  }

  async function fireGenerate() {
    const payload = buildGenPayload();
    if (!payload) return;
    const seq = ++genSeq;
    const ep = epoch;
    const forWord = lockedWord || currentWord;
    genInFlight = true;
    setLoading(true, payload.word);
    try {
      const r = await api("/api/generate", payload, 90000);
      if (ep === epoch && seq > shownSeq && r && r.image) {
        shownSeq = seq;
        showMagic(r.image, forWord, r.ms);
      }
    } catch (_) {
      if (ep === epoch) $("#magicMeta").textContent = "Oops, the magic hiccuped — try again!";
    } finally {
      genInFlight = false;
      if (genQueued) {
        genQueued = false;
        fireGenerate();
      } else {
        setLoading(false);
      }
    }
  }

  // ---------- Magic preview ----------
  const magicEl = $("#magic");
  const magicImg = $("#magicImg");
  const magicEmpty = $("#magicEmpty");
  const magicWord = $("#magicWord");
  const magicMeta = $("#magicMeta");

  function setLoading(on, word) {
    magicEl.classList.toggle("loading", on);
    magicEl.setAttribute("aria-busy", on ? "true" : "false");
    if (on) magicMeta.textContent = "Drawing “" + word + "”…";
  }

  function showMagic(src, w, ms) {
    magicImage = src;
    magicFor = w;
    // restart fade-in animation
    magicImg.classList.add("swap");
    void magicImg.offsetWidth;
    magicImg.classList.remove("swap");
    magicImg.src = src;
    magicImg.alt = "Picture of " + w.word;
    magicImg.hidden = false;
    magicEmpty.hidden = true;
    magicWord.textContent = w.word;
    magicWord.hidden = false;
    magicMeta.textContent = ms ? "Made in " + (ms / 1000).toFixed(1) + "s ✨" : "Ta-da! ✨";
    updateAddBtn();
  }

  function resetMagic() {
    magicImage = null;
    magicFor = null;
    magicImg.hidden = true;
    magicImg.removeAttribute("src");
    magicEmpty.hidden = false;
    magicWord.hidden = true;
    magicMeta.textContent = "";
    setLoading(false);
    updateAddBtn();
  }

  // ---------- Chips / typed word / style ----------
  const chipsEl = $("#chips");
  function renderChips(labels) {
    chipsEl.innerHTML = "";
    if (!labels.length) {
      const s = document.createElement("span");
      s.className = "chips-empty";
      s.textContent = lockedWord ? "Using your word: " + lockedWord.word : "Start drawing and I'll guess!";
      chipsEl.appendChild(s);
      return;
    }
    const max = Math.max(...labels.map((l) => l.score || 0), 0.0001);
    labels.forEach((l, i) => {
      const b = document.createElement("button");
      const cat = normCat(l.category);
      b.className = "chip c-" + cat;
      b.setAttribute("role", "radio");
      const active = lockedWord ? lockedWord.word === l.word : i === 0;
      b.setAttribute("aria-checked", active ? "true" : "false");
      const pct = Math.round(((l.score || 0) / max) * 100);
      b.style.setProperty("--score", pct + "%");
      b.setAttribute("aria-label", l.word + (l.score != null ? ", " + Math.round(l.score * 100) + " percent sure" : ""));
      b.innerHTML = "";
      b.appendChild(document.createTextNode(l.word));
      const bar = document.createElement("span");
      bar.className = "bar"; bar.setAttribute("aria-hidden", "true");
      b.appendChild(bar);
      b.addEventListener("click", () => {
        lockedWord = { word: l.word, category: cat };
        currentWord = lockedWord;
        chipsEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", c === b ? "true" : "false"));
        speak(l.word);
        requestGenerate();
      });
      chipsEl.appendChild(b);
    });
  }

  $("#typeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#typeWord");
    const w = input.value.trim().replace(/\s+/g, " ");
    if (!w) return;
    const match = lastLabels.find((l) => l.word.toLowerCase() === w.toLowerCase());
    lockedWord = { word: w, category: match ? normCat(match.category) : "things" };
    currentWord = lockedWord;
    chipsEl.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-checked", "false"));
    if (!lastLabels.length) renderChips([]);
    input.value = "";
    input.blur();
    if (!backendReady) { toast("The magic is still warming up…"); return; }
    requestGenerate();
  });

  const stylesEl = $("#styles");
  function renderStyles() {
    stylesEl.querySelectorAll(".style").forEach((b) => b.setAttribute("aria-checked", b.dataset.style === style ? "true" : "false"));
  }
  stylesEl.querySelectorAll(".style").forEach((b) => {
    b.addEventListener("click", () => {
      if (style === b.dataset.style) return;
      style = b.dataset.style;
      store.set("dt_style", style);
      renderStyles();
      if (lockedWord || currentWord) requestGenerate();
    });
  });
  if (!["pictogram", "storybook", "clay", "crayon"].includes(style)) style = "pictogram";
  renderStyles();

  // ---------- Board ----------
  const boardEl = $("#board");
  const STARTERS = [
    { word: "I", category: "people" },
    { word: "want", category: "actions" },
    { word: "more", category: "descriptors" },
    { word: "help", category: "actions" },
    { word: "yes", category: "social" },
    { word: "no", category: "social" },
  ];
  let cards = store.get("dt_cards", null);
  if (!Array.isArray(cards)) {
    cards = STARTERS.map((s) => ({ id: "starter-" + s.word, word: s.word, category: s.category, image: null, starter: true }));
    store.set("dt_cards", cards);
  }
  const pendingIds = new Set();

  function saveCards() {
    if (!store.set("dt_cards", cards)) {
      // Quota trouble: try to keep words even if images don't fit.
      console.warn("DoodleTalk: could not save board (storage full or unavailable)");
    }
  }

  // Downscale to keep localStorage small.
  function shrink(dataURL, size = 256) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = size;
          const x = c.getContext("2d");
          x.fillStyle = "#fff"; x.fillRect(0, 0, size, size);
          x.drawImage(img, 0, 0, size, size);
          resolve(c.toDataURL("image/jpeg", 0.85));
        } catch (_) { resolve(dataURL); }
      };
      img.onerror = () => resolve(dataURL);
      img.src = dataURL;
    });
  }

  function cardEl(card) {
    const cat = normCat(card.category);
    const el = document.createElement("div");
    el.className = "card c-" + cat;
    el.dataset.id = card.id;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", "Say " + card.word);

    const art = document.createElement("div");
    art.className = "art";
    if (card.image) {
      const img = document.createElement("img");
      img.src = card.image; img.alt = ""; img.draggable = false;
      art.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "ph" + (pendingIds.has(card.id) || (card.starter && !card.image) ? " pending" : "");
      ph.textContent = card.word;
      art.appendChild(ph);
    }
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = card.word;

    const del = document.createElement("button");
    del.className = "del";
    del.setAttribute("aria-label", "Delete card " + card.word);
    del.textContent = "✕";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteCard(card.id);
    });
    del.addEventListener("pointerdown", (e) => e.stopPropagation());

    el.append(art, label, del);

    // tap vs long-press
    let pressTimer = null, longPressed = false;
    el.addEventListener("pointerdown", () => {
      longPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        longPressed = true;
        disarmAll();
        el.classList.add("armed");
        if (navigator.vibrate) try { navigator.vibrate(30); } catch (_) {}
      }, 600);
    });
    const cancel = () => clearTimeout(pressTimer);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("click", () => {
      if (longPressed) { longPressed = false; return; }
      if (el.classList.contains("armed")) { el.classList.remove("armed"); return; }
      tapCard(card, el);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tapCard(card, el); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteCard(card.id); }
    });
    return el;
  }

  function disarmAll() { boardEl.querySelectorAll(".card.armed").forEach((c) => c.classList.remove("armed")); }
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".card.armed")) disarmAll(); });

  function renderBoard() {
    boardEl.innerHTML = "";
    if (!cards.length) {
      const p = document.createElement("p");
      p.className = "chips-empty";
      p.textContent = "Your board is empty — draw something and add it!";
      boardEl.appendChild(p);
      return;
    }
    cards.forEach((c) => boardEl.appendChild(cardEl(c)));
  }

  function tapCard(card, el) {
    el.classList.remove("tapped");
    void el.offsetWidth;
    el.classList.add("tapped");
    speak(card.word);
    addToSentence(card);
  }

  function deleteCard(id) {
    const idx = cards.findIndex((c) => c.id === id);
    if (idx < 0) return;
    const [removed] = cards.splice(idx, 1);
    saveCards();
    renderBoard();
    toast("Removed “" + removed.word + "”");
  }

  const addBtn = $("#addBtn");
  function updateAddBtn() {
    const ok = !!(magicImage && magicFor);
    addBtn.disabled = !ok;
    addBtn.classList.toggle("ready", ok);
    addBtn.textContent = ok ? "➕ Add “" + magicFor.word + "” to my board" : "➕ Add to my board";
  }
  addBtn.addEventListener("click", async () => {
    if (!magicImage || !magicFor) return;
    addBtn.disabled = true;
    const small = await shrink(magicImage);
    const card = { id: uid(), word: magicFor.word, category: normCat(magicFor.category), image: small };
    cards.push(card);
    saveCards();
    renderBoard();
    speak(card.word);
    toast("Added “" + card.word + "” to your board!");
    updateAddBtn();
    const el = boardEl.querySelector('[data-id="' + card.id + '"]');
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); } catch (_) {}
    }
  });

  // Starter cards are core words (I, want, yes...). Abstract words don't draw well with a diffusion model,
  // and real AAC boards keep core words as fixed symbols anyway, so we render them locally; AI is for nouns.
  const STARTER_SYMBOLS = { I: "\u{1F64B}", want: "\u{1F932}", more: "\u2795", help: "\u{1F64F}", yes: "\u2705", no: "\u274C" };
  function symbolImage(word) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 256, 256);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.fillText(STARTER_SYMBOLS[word] || word, 128, 136);
    return c.toDataURL("image/png");
  }
  function fillStarterImages() {
    for (const card of cards.filter((c) => c.starter && STARTER_SYMBOLS[c.word] && !c.symbol)) {
      card.image = symbolImage(card.word);
      card.symbol = true;
      const el = boardEl.querySelector('[data-id="' + card.id + '"]');
      if (el) el.replaceWith(cardEl(card));
    }
    saveCards();
  }

  $("#rerollBtn").addEventListener("click", () => {
    seed = Math.floor(Math.random() * 100000);
    requestGenerate();
  });
  $("#printBtn").addEventListener("click", () => window.print());

  // ---------- Sentence strip ----------
  const sentenceEl = $("#sentence");
  let sentence = [];
  function renderSentence() {
    sentenceEl.innerHTML = "";
    if (!sentence.length) {
      const s = document.createElement("span");
      s.className = "sentence-empty";
      s.textContent = "Tap cards to build a sentence…";
      sentenceEl.appendChild(s);
      return;
    }
    sentence.forEach((w) => {
      const d = document.createElement("div");
      d.className = "s-word c-" + normCat(w.category);
      if (w.image) {
        const img = document.createElement("img");
        img.src = w.image; img.alt = "";
        d.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "s-ph"; ph.textContent = w.word;
        d.appendChild(ph);
      }
      const t = document.createElement("span");
      t.textContent = w.word;
      d.appendChild(t);
      sentenceEl.appendChild(d);
    });
    sentenceEl.scrollLeft = sentenceEl.scrollWidth;
  }
  function addToSentence(card) {
    sentence.push({ word: card.word, category: card.category, image: card.image });
    renderSentence();
  }
  $("#backspace").addEventListener("click", () => { sentence.pop(); renderSentence(); });
  $("#clearSentence").addEventListener("click", () => { sentence = []; renderSentence(); });
  $("#speakAll").addEventListener("click", () => {
    if (!sentence.length) { speak("Tap some cards first!"); return; }
    const els = [...sentenceEl.querySelectorAll(".s-word")];
    els.forEach((e) => e.classList.add("speaking"));
    speak(sentence.map((w) => w.word).join(" "), () => els.forEach((e) => e.classList.remove("speaking")));
    setTimeout(() => els.forEach((e) => e.classList.remove("speaking")), 8000);
  });

  // ---------- Boot ----------
  redraw();
  renderChips([]);
  renderBoard();
  fillStarterImages();
  renderSentence();
  updateAddBtn();
  checkHealth();
})();
