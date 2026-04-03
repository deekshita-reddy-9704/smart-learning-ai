// course.js — All course page logic (reading, audio, writing, flashcards, exercises)
// Quiz logic lives in quiz.js · Visual (D3) lives in visual.js

"use strict";

/* ── State ─────────────────────────────────────────────────────────────────── */
let activeTab      = "reading";
let activeModuleId = null;
let flashcards     = [];
let cardIndex      = 0;
let cardFlipped    = false;
let audioEl        = null;
let ghostText      = "";

/* ══════════════════════════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════════════════════════ */
function initCoursePage() {
  audioEl = document.getElementById("audio-el");
  if (audioEl) setupAudioListeners();

  // Load existing modules if they exist
  loadModules();

  // Drag-and-drop is on the upload modal (handled in main.js)
  console.log("[course] Page ready. course_id =", COURSE_ID);
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════════════════════════════════════════════ */
function switchTab(tabName) {
  // Deactivate all tabs and panels
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

  // Activate chosen
  const tab   = document.querySelector(`[data-tab="${tabName}"]`);
  const panel = document.getElementById(`tab-${tabName}`);
  if (tab)   tab.classList.add("active");
  if (panel) panel.classList.add("active");

  activeTab = tabName;

  // Lazy-load content when tab first opened
  if (tabName === "reading"    && isNotesEmpty())      generateNotes();
  if (tabName === "flashcard"  && flashcards.length === 0) generateFlashcards();
  if (tabName === "visual"     && isSvgEmpty())        generateVisual();
  if (tabName === "kinesthetic"&& isExercisesEmpty())  generateExercises();
}

function isNotesEmpty() {
  const c = document.getElementById("notes-container");
  return c && c.querySelector(".panel-empty");
}
function isSvgEmpty() {
  return document.getElementById("visual-svg").classList.contains("hidden");
}
function isExercisesEmpty() {
  const c = document.getElementById("exercises-container");
  return c && c.querySelector(".panel-empty");
}

/* ══════════════════════════════════════════════════════════════════════════════
   MODULES
══════════════════════════════════════════════════════════════════════════════ */
async function loadModules() {
  try {
    const data = await API.get(`/api/courses/${COURSE_ID}/modules`);
    if (data.modules && data.modules.length > 0) {
      renderModuleList(data.modules);
      document.getElementById("generate-modules-btn").innerHTML =
        '<i class="fa fa-rotate-right"></i> Regenerate Plan';
      document.getElementById("action-hint").textContent =
        "Click to regenerate AI learning modules";
    }
  } catch (_) {
    // No modules yet — that's fine, user will click Generate
  }
}

async function generateModules() {
  showLoader("Generating personalised learning plan…");
  try {
    const data = await API.post(`/api/courses/${COURSE_ID}/generate-modules`);
    renderModuleList(data.modules);
    document.getElementById("generate-modules-btn").innerHTML =
      '<i class="fa fa-rotate-right"></i> Regenerate Plan';
    document.getElementById("action-hint").textContent =
      `${data.count} modules created — select one from the sidebar`;
    showToast("Learning plan generated!", "success");

    // Auto-load notes for first module
    if (data.modules.length > 0) {
      selectModule(data.modules[0].id, data.modules[0].title);
    }
  } catch (err) {
    showToast("Failed to generate modules: " + err.message, "error");
  } finally {
    hideLoader();
  }
}

function renderModuleList(modules) {
  const list = document.getElementById("module-list");
  list.innerHTML = "";
  modules.forEach((m, i) => {
    const item = document.createElement("div");
    item.className  = "module-item";
    item.dataset.id = m.id;
    item.innerHTML  = `
      <div class="module-num">${i + 1}</div>
      <div class="module-item-text">
        <div class="module-item-title">${escHtml(m.title)}</div>
        <div class="module-item-desc">${escHtml(m.description || "")}</div>
      </div>`;
    item.addEventListener("click", () => selectModule(m.id, m.title));
    list.appendChild(item);
  });
}

function selectModule(moduleId, moduleTitle) {
  activeModuleId = moduleId;

  // Highlight in sidebar
  document.querySelectorAll(".module-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id == moduleId);
  });

  // Update podcast title
  const pSub = document.getElementById("podcast-sub");
  if (pSub) pSub.textContent = moduleTitle;

  // Reload active tab content for the new module
  if (activeTab === "reading")     generateNotes(true);
  if (activeTab === "flashcard")   generateFlashcards(true);
  if (activeTab === "kinesthetic") generateExercises(true);
}

/* ══════════════════════════════════════════════════════════════════════════════
   READING — NOTES
══════════════════════════════════════════════════════════════════════════════ */
async function generateNotes(silent = false) {
  if (!silent) showLoader("Generating AI notes…");
  try {
    const payload = activeModuleId ? { module_id: activeModuleId } : {};
    const data    = await API.post(`/api/courses/${COURSE_ID}/generate-notes`, payload);
    renderNotes(data.content);
    if (!silent) showToast("Notes generated!", "success");
  } catch (err) {
    if (!silent) showToast("Failed to generate notes: " + err.message, "error");
    showNotesError(err.message);
  } finally {
    hideLoader();
  }
}

function renderNotes(markdown) {
  const container = document.getElementById("notes-container");
  // marked.js is loaded via CDN
  const html = typeof marked !== "undefined"
    ? marked.parse(markdown)
    : `<pre>${escHtml(markdown)}</pre>`;

  container.innerHTML = `<div class="notes-content">${html}</div>`;

  // Enable PDF download button
  const pdfBtn = document.getElementById("download-pdf-btn");
  if (pdfBtn) pdfBtn.disabled = false;

  // Store for audio use
  window._lastNotesText = markdown;
}

function showNotesError(msg) {
  document.getElementById("notes-container").innerHTML = `
    <div class="panel-empty">
      <i class="fa fa-triangle-exclamation empty-icon-lg" style="color:var(--accent)"></i>
      <h3>Could not load notes</h3>
      <p>${escHtml(msg)}</p>
      <button class="btn btn-primary" onclick="generateNotes()">
        <i class="fa fa-rotate-right"></i> Retry
      </button>
    </div>`;
}

/* ── Download notes as PDF ──────────────────────────────────── */
async function downloadNotesPDF() {
  if (typeof window.jspdf === "undefined") {
    showToast("jsPDF not loaded — check CDN", "error");
    return;
  }

  const rawText = window._lastNotesText || "No notes generated yet.";

  // ── Convert markdown to clean readable text for PDF ───────────────────
  function mdToPlainText(md) {
    const lines  = md.split("\n");
    const result = [];

    for (let line of lines) {
      // Headings → UPPERCASE label with blank line before
      if (/^#{1,6}\s+/.test(line)) {
        const level   = line.match(/^(#{1,6})/)[1].length;
        const heading = line.replace(/^#{1,6}\s+/, "").trim();
        if (result.length > 0) result.push("");
        result.push(level === 1 ? heading.toUpperCase() : heading);
        result.push("");
        continue;
      }

      // Horizontal rules → blank line
      if (/^[-*_]{3,}\s*$/.test(line)) {
        result.push("");
        continue;
      }

      // Blockquotes → indent
      if (/^\s*>\s+/.test(line)) {
        result.push("  " + line.replace(/^\s*>\s+/, ""));
        continue;
      }

      // Bullet points → clean dash
      if (/^\s*[-*+]\s+/.test(line)) {
        result.push("  • " + line.replace(/^\s*[-*+]\s+/, ""));
        continue;
      }

      // Numbered lists → keep number
      if (/^\s*(\d+)\.\s+/.test(line)) {
        result.push("  " + line.trim());
        continue;
      }

      // Code blocks (single line ``` fence) → skip fence markers
      if (/^```/.test(line.trim())) {
        continue;
      }

      // Inline formatting — strip symbols, keep text
      let clean = line
        .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
        .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
        .replace(/!\[[^\]]*\]\([^\)]+\)/g, "")
        .replace(/<[^>]+>/g, "");

      result.push(clean);
    }

    return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  const cleanText = mdToPlainText(rawText);

  // ── Build PDF ─────────────────────────────────────────────────────────
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxW   = pageW - margin * 2;
  let y        = margin;

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(COURSE_TITLE, margin, y);
  y += 10;

  // Subtitle line
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text("Generated by Smart AI Micro-Learning Assistant", margin, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Divider
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  // Notes content
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const paragraphs = cleanText.split("\n");

  for (const para of paragraphs) {
    if (!para.trim()) {
      y += 4;  // blank line gap
      continue;
    }

    // Detect headings we converted to UPPERCASE
    const isHeading = para === para.toUpperCase() && para.length > 2 && !/^\s*•/.test(para);

    if (isHeading) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }

    const wrapped = doc.splitTextToSize(para, maxW);

    for (const wline of wrapped) {
      // New page if needed
      if (y + 6 > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(wline, margin, y);
      y += 6;
    }

    if (isHeading) y += 2;
  }

  // Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageW / 2,
      pageH - 10,
      { align: "center" }
    );
  }

  doc.save(`${COURSE_TITLE.replace(/\s+/g, "_")}_notes.pdf`);
  showToast("PDF downloaded!", "success");
}

/* ══════════════════════════════════════════════════════════════════════════════
   AUDIO (TTS)
══════════════════════════════════════════════════════════════════════════════ */
async function generateAudio() {
  // Get notes text — generate if needed
  let text = window._lastNotesText;
  if (!text) {
    showToast("Generating notes first…", "success");
    await generateNotes(true);
    text = window._lastNotesText;
  }
  if (!text) {
    showToast("No notes to convert to audio.", "error");
    return;
  }

  const btn = document.getElementById("tts-btn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Generating audio…';

  try {
    const resp = await fetch(`/api/courses/${COURSE_ID}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (resp.status === 501) {
      // gTTS not available — fallback to Web Speech API
      useBrowserTTS(text);
      return;
    }

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "TTS failed");
    }

    const blob  = await resp.blob();
    const url   = URL.createObjectURL(blob);
    audioEl.src = url;
    audioEl.load();
    showToast("Audio ready! Press play.", "success");
    document.getElementById("podcast-sub").textContent = "AI-generated lesson audio";

  } catch (err) {
    showToast("Audio error: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-magic"></i> Regenerate Audio';
  }
}

function _stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, " code block omitted ")
    .replace(/`[^`]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/^\s*>\s+/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^\)]+\)/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function useBrowserTTS(text) {
  if (!("speechSynthesis" in window)) {
    showToast("Text-to-speech not supported in your browser.", "error");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const cleanText = _stripMarkdown(text);
  const utt       = new SpeechSynthesisUtterance(cleanText);
  utt.rate  = window._ttsRate || 1;
  utt.pitch = 1;
  utt.lang  = "en-US";

  utt.onstart = () => {
    document.getElementById("waveform").classList.add("playing");
    document.getElementById("play-icon").className = "fa fa-pause";
    window._browserTTSPlaying = true;
  };
  utt.onend = utt.onerror = () => {
    document.getElementById("waveform").classList.remove("playing");
    document.getElementById("play-icon").className = "fa fa-play";
    window._browserTTSPlaying = false;
  };

  window._browserTTSUtt = utt;
  window._browserTTSText = cleanText;
  window._browserTTSObj  = window.speechSynthesis;
  window.speechSynthesis.speak(utt);
  showToast("Playing via browser TTS", "success");

  const btn = document.getElementById("tts-btn");
  btn.disabled  = false;
  btn.innerHTML = '<i class="fa fa-magic"></i> Regenerate Audio';
}
function setupAudioListeners() {
  audioEl.addEventListener("timeupdate", updateAudioProgress);
  audioEl.addEventListener("loadedmetadata", () => {
    document.getElementById("audio-duration").textContent = fmtTime(audioEl.duration);
  });
  audioEl.addEventListener("ended", () => {
    document.getElementById("play-icon").className = "fa fa-play";
    document.getElementById("waveform").classList.remove("playing");
  });
  audioEl.addEventListener("play", () => {
    document.getElementById("play-icon").className = "fa fa-pause";
    document.getElementById("waveform").classList.add("playing");
  });
  audioEl.addEventListener("pause", () => {
    document.getElementById("play-icon").className = "fa fa-play";
    document.getElementById("waveform").classList.remove("playing");
  });
}

function toggleAudio() {
  // Browser TTS mode
  if (window._browserTTSObj) {
    if (window._browserTTSPlaying) {
      window.speechSynthesis.pause();
      window._browserTTSPlaying = false;
      document.getElementById("play-icon").className = "fa fa-play";
      document.getElementById("waveform").classList.remove("playing");
    } else if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      window._browserTTSPlaying = true;
      document.getElementById("play-icon").className = "fa fa-pause";
      document.getElementById("waveform").classList.add("playing");
    } else {
      // Nothing playing — start fresh
      generateAudio();
    }
    return;
  }
  // Native audio element mode
  if (!audioEl.src) {
    generateAudio();
    return;
  }
  if (audioEl.paused) audioEl.play();
  else audioEl.pause();
}

function skipAudio(secs) {
  // Native audio element
  if (audioEl.src) {
    audioEl.currentTime = Math.max(0, audioEl.currentTime + secs);
    return;
  }
  // Browser TTS — Web Speech API has no seek, so restart from beginning
  if (window._browserTTSObj && window._browserTTSText) {
    showToast("Seeking not supported in browser TTS mode", "error");
  }
}

function seekAudio(val) {
  if (audioEl.duration) audioEl.currentTime = (val / 100) * audioEl.duration;
}

function setSpeed(rate, btn) {
  window._ttsRate = rate;

  // Native audio element
  if (audioEl.src) audioEl.playbackRate = rate;

  // Browser TTS — must restart with new rate (Web Speech API limitation)
  if (window._browserTTSObj && window._browserTTSText) {
    window.speechSynthesis.cancel();
    const utt   = new SpeechSynthesisUtterance(window._browserTTSText);
    utt.rate    = rate;
    utt.pitch   = 1;
    utt.lang    = "en-US";
    utt.onstart = () => {
      document.getElementById("waveform").classList.add("playing");
      document.getElementById("play-icon").className = "fa fa-pause";
      window._browserTTSPlaying = true;
    };
    utt.onend = utt.onerror = () => {
      document.getElementById("waveform").classList.remove("playing");
      document.getElementById("play-icon").className = "fa fa-play";
      window._browserTTSPlaying = false;
    };
    window._browserTTSUtt = utt;
    window.speechSynthesis.speak(utt);
    showToast(`Speed set to ${rate}×`, "success");
  }

  document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function loadAudio() {
  if (!window._lastNotesText) generateNotes(true);
}

function updateAudioProgress() {
  if (!audioEl.duration) return;
  const pct = (audioEl.currentTime / audioEl.duration) * 100;
  document.getElementById("audio-progress").value = pct;
  document.getElementById("audio-current").textContent = fmtTime(audioEl.currentTime);
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   WRITING MODE
══════════════════════════════════════════════════════════════════════════════ */
async function generateWritingPrompt() {
  showLoader("Generating writing prompt…");
  try {
    const payload = activeModuleId ? { module_id: activeModuleId } : {};
    const data    = await API.post(`/api/courses/${COURSE_ID}/generate-writing`, payload);

    document.getElementById("writing-prompt-text").textContent = data.prompt || "Write about this topic.";
    ghostText = data.ghost_text || "";
    renderGhostText(document.getElementById("writing-area").value || "");
    showToast("New prompt ready!", "success");
  } catch (err) {
    showToast("Failed to generate prompt: " + err.message, "error");
  } finally {
    hideLoader();
  }
}

function renderGhostText(userInput) {
  const layer = document.getElementById("ghost-layer");
  if (!layer || !ghostText) return;

  // Show ghost text that the user hasn't typed yet
  const typed  = userInput;
  const ghost  = ghostText;

  if (typed.length === 0) {
    layer.textContent = ghost;
    return;
  }

  // Fade out the portion the user has typed
  const remaining = ghost.slice(typed.length);
  layer.textContent = " ".repeat(typed.length) + remaining;
}

function syncGhost(textarea) {
  renderGhostText(textarea.value);
  updateWordCount(textarea.value);
}

function syncScroll(textarea) {
  const layer = document.getElementById("ghost-layer");
  if (layer) layer.scrollTop = textarea.scrollTop;
}

function updateWordCount(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById("word-count").textContent = `${words} word${words !== 1 ? "s" : ""}`;
}

function clearWriting() {
  document.getElementById("writing-area").value = "";
  renderGhostText("");
  updateWordCount("");
}

/* ══════════════════════════════════════════════════════════════════════════════
   FLASHCARDS
══════════════════════════════════════════════════════════════════════════════ */
async function generateFlashcards(silent = false) {
  if (!silent) showLoader("Generating AI flashcards…");
  try {
    const payload = activeModuleId ? { module_id: activeModuleId, count: 10 } : { count: 10 };
    const data    = await API.post(`/api/courses/${COURSE_ID}/generate-flashcards`, payload);
    flashcards    = data.flashcards || [];
    cardIndex     = 0;
    renderFlashcards();
    if (!silent) showToast(`${flashcards.length} flashcards generated!`, "success");
  } catch (err) {
    if (!silent) showToast("Failed to generate flashcards: " + err.message, "error");
  } finally {
    hideLoader();
  }
}

function renderFlashcards() {
  const scene = document.getElementById("flashcard-scene");
  const empty = document.getElementById("fc-empty");

  if (!flashcards.length) {
    scene.style.display = "none";
    document.querySelector(".flashcard-nav").style.display = "none";
    empty.classList.remove("hidden");
    return;
  }

  scene.style.display = "";
  document.querySelector(".flashcard-nav").style.display = "";
  empty.classList.add("hidden");

  showCard(0);
  renderDots();

  document.getElementById("prev-card-btn").disabled = true;
  document.getElementById("next-card-btn").disabled = flashcards.length <= 1;
  document.getElementById("card-counter").textContent = `${cardIndex + 1} / ${flashcards.length}`;
}

function showCard(idx) {
  cardIndex   = idx;
  cardFlipped = false;
  const card  = document.getElementById("flashcard");
  card.classList.remove("flipped");

  document.getElementById("card-question").textContent = flashcards[idx].question;
  document.getElementById("card-answer").textContent   = flashcards[idx].answer;
  document.getElementById("card-counter").textContent  = `${idx + 1} / ${flashcards.length}`;

  document.getElementById("prev-card-btn").disabled = idx === 0;
  document.getElementById("next-card-btn").disabled = idx === flashcards.length - 1;

  // Update dots
  document.querySelectorAll(".card-dot").forEach((d, i) => {
    d.classList.toggle("active", i === idx);
  });
}

function flipCard() {
  cardFlipped = !cardFlipped;
  document.getElementById("flashcard").classList.toggle("flipped", cardFlipped);
}

function prevCard() { if (cardIndex > 0) showCard(cardIndex - 1); }
function nextCard() { if (cardIndex < flashcards.length - 1) showCard(cardIndex + 1); }

function renderDots() {
  const dotsEl = document.getElementById("card-dots");
  dotsEl.innerHTML = "";
  const max  = Math.min(flashcards.length, 12); // cap dots at 12
  for (let i = 0; i < max; i++) {
    const d = document.createElement("span");
    d.className = "card-dot" + (i === 0 ? " active" : "");
    d.addEventListener("click", () => showCard(i));
    dotsEl.appendChild(d);
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   EXERCISES (KINESTHETIC)
══════════════════════════════════════════════════════════════════════════════ */
async function generateExercises(silent = false) {
  if (!silent) showLoader("Generating practical exercises…");
  try {
    const payload = activeModuleId ? { module_id: activeModuleId, count: 3 } : { count: 3 };
    const data    = await API.post(`/api/courses/${COURSE_ID}/generate-exercises`, payload);
    renderExercises(data.exercises || []);
    if (!silent) showToast("Exercises ready!", "success");
  } catch (err) {
    if (!silent) showToast("Failed to generate exercises: " + err.message, "error");
  } finally {
    hideLoader();
  }
}

function renderExercises(exercises) {
  const container = document.getElementById("exercises-container");

  if (!exercises.length) {
    container.innerHTML = `
      <div class="panel-empty">
        <i class="fa fa-dumbbell empty-icon-lg"></i>
        <h3>No exercises generated</h3>
        <button class="btn btn-primary" onclick="generateExercises()">
          <i class="fa fa-rotate-right"></i> Try Again
        </button>
      </div>`;
    return;
  }

  container.innerHTML = exercises.map((ex, i) => `
    <div class="exercise-card">
      <div class="exercise-header">
        <div class="exercise-title">
          <i class="fa fa-circle-check" style="color:var(--primary)"></i>
          Exercise ${i + 1}: ${escHtml(ex.title)}
        </div>
        <span class="exercise-badge badge-${ex.difficulty || 'easy'}">
          ${escHtml(ex.difficulty || "easy")}
        </span>
      </div>
      <p class="exercise-desc">${escHtml(ex.description)}</p>
      <ol class="exercise-steps">
        ${(ex.steps || []).map(s => `<li>${escHtml(s)}</li>`).join("")}
      </ol>
      ${ex.expected_output ? `
        <div class="exercise-outcome">
          <i class="fa fa-bullseye"></i>
          <span><strong>Expected outcome:</strong> ${escHtml(ex.expected_output)}</span>
        </div>` : ""}
    </div>`).join("");
}

/* ══════════════════════════════════════════════════════════════════════════════
   UTILITIES (shared with quiz.js / visual.js)
══════════════════════════════════════════════════════════════════════════════ */
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showLoader(msg = "Working…") {
  document.getElementById("loader-text").textContent = msg;
  document.getElementById("global-loader").classList.remove("hidden");
}
function hideLoader() {
  document.getElementById("global-loader").classList.add("hidden");
}

function showToast(msg, type = "success") {
  const toast = document.getElementById("toast");
  const icon  = document.getElementById("toast-icon");
  document.getElementById("toast-msg").textContent = msg;
  toast.className = `toast ${type}`;
  icon.className  = type === "success" ? "fa fa-check-circle" : "fa fa-circle-exclamation";
  toast.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

// Make helpers global so quiz.js / visual.js can use them
window.showLoader = showLoader;
window.hideLoader = hideLoader;
window.showToast  = showToast;
window.escHtml    = escHtml;