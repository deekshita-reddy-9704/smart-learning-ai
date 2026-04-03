// main.js — Home page logic + global upload modal
"use strict";

/* ══════════════════════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════════════════════ */
let _allCourses    = [];
let _searchQuery   = "";
let _activeCategory   = "";
let _activeDifficulty = "";
let _uploadFile    = null;

/* ══════════════════════════════════════════════════════════════════════════════
   HOME — COURSES
══════════════════════════════════════════════════════════════════════════════ */

/** Fetch and render all courses (with optional filters). */
async function loadCourses(q = "", category = "", difficulty = "") {
  const grid  = document.getElementById("course-grid");
  const empty = document.getElementById("empty-state");
  if (!grid) return;

  // Show skeletons while loading
  grid.innerHTML = Array(6).fill('<div class="skeleton-card"></div>').join("");
  if (empty) empty.classList.add("hidden");

  try {
    const params = new URLSearchParams();
    if (q)          params.set("q",          q);
    if (category)   params.set("category",   category);
    if (difficulty) params.set("difficulty", difficulty);

    const data = await API.get(`/api/courses?${params}`);
    _allCourses = data.courses || [];
    renderCourseGrid(_allCourses);

    const count = document.getElementById("results-count");
    if (count) {
      count.textContent = `${_allCourses.length} course${_allCourses.length !== 1 ? "s" : ""} found`;
      count.classList.toggle("hidden", !q && !category && !difficulty);
    }
  } catch (err) {
    if (grid) grid.innerHTML = `
      <div class="panel-empty" style="grid-column:1/-1">
        <i class="fa fa-triangle-exclamation empty-icon-lg" style="color:var(--accent)"></i>
        <h3>Could not load courses</h3>
        <p>${_esc(err.message)}</p>
        <button class="btn btn-primary" onclick="loadCourses()">
          <i class="fa fa-rotate-right"></i> Retry
        </button>
      </div>`;
  }
}

/** Render course cards into the grid. */
function renderCourseGrid(courses) {
  const grid  = document.getElementById("course-grid");
  const empty = document.getElementById("empty-state");
  if (!grid) return;

  if (!courses.length) {
    grid.innerHTML = "";
    if (empty) empty.classList.remove("hidden");
    return;
  }
  if (empty) empty.classList.add("hidden");

  const diffLabel = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
  const diffClass = { beginner: "badge-beginner", intermediate: "badge-intermediate", advanced: "badge-advanced" };

  grid.innerHTML = courses.map(c => {
    const tags    = Array.isArray(c.tags) ? c.tags : [];
    const tagHtml = tags.slice(0, 3).map(t => `<span class="card-tag">${_esc(t)}</span>`).join("");
    const diff    = c.difficulty || "beginner";

    return `
      <a class="course-card" href="/course/${c.id}">
        <div class="card-meta">
          <span class="badge badge-category">${_esc(c.category || "General")}</span>
          <span class="badge ${diffClass[diff] || "badge-beginner"}">${diffLabel[diff] || diff}</span>
        </div>
        <div class="card-title">${_esc(c.title)}</div>
        <div class="card-desc">${_esc(_truncate(c.description || "", 110))}</div>
        <div class="card-footer">
          <div class="card-tags">${tagHtml}</div>
          <span class="card-arrow"><i class="fa fa-arrow-right"></i></span>
        </div>
      </a>`;
  }).join("");
}

/* ══════════════════════════════════════════════════════════════════════════════
   HOME — CATEGORIES
══════════════════════════════════════════════════════════════════════════════ */
async function loadCategories() {
  try {
    const data  = await API.get("/api/categories");
    const chips = document.getElementById("category-chips");
    if (!chips) return;

    (data.categories || []).forEach(cat => {
      const btn = document.createElement("button");
      btn.className        = "chip";
      btn.dataset.category = cat;
      btn.textContent      = cat;
      btn.addEventListener("click", () => setCategoryFilter(cat, btn));
      chips.appendChild(btn);
    });
  } catch (_) {
    // Non-critical — filters just won't populate
  }
}

function setCategoryFilter(cat, btn) {
  _activeCategory = (_activeCategory === cat) ? "" : cat;
  document.querySelectorAll("#category-chips .chip").forEach(c => {
    c.classList.toggle("active", c.dataset.category === _activeCategory || (!_activeCategory && c.dataset.category === ""));
  });
  _applyFilters();
}

/* ══════════════════════════════════════════════════════════════════════════════
   HOME — SEARCH
══════════════════════════════════════════════════════════════════════════════ */
function setupSearchListeners() {
  const input = document.getElementById("search-input");
  if (!input) return;

  // Debounced live search
  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _searchQuery = input.value.trim();
      _applyFilters();
    }, 320);
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      clearTimeout(timer);
      _searchQuery = input.value.trim();
      _applyFilters();
    }
  });

  // Difficulty chips
  document.querySelectorAll(".diff-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      _activeDifficulty = chip.dataset.difficulty || "";
      document.querySelectorAll(".diff-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      _applyFilters();
    });
  });
}

function triggerSearch() {
  const input = document.getElementById("search-input");
  if (input) _searchQuery = input.value.trim();
  _applyFilters();
}

function _applyFilters() {
  // Update section title
  const title = document.getElementById("section-title");
  if (title) {
    title.textContent = _searchQuery
      ? `Results for "${_searchQuery}"`
      : "Available Courses";
  }
  loadCourses(_searchQuery, _activeCategory, _activeDifficulty);
}

/* ══════════════════════════════════════════════════════════════════════════════
   UPLOAD MODAL
══════════════════════════════════════════════════════════════════════════════ */
function showUploadModal() {
  document.getElementById("upload-modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  resetUploadModal();
}

function hideUploadModal() {
  document.getElementById("upload-modal").classList.add("hidden");
  document.body.style.overflow = "";
}

function resetUploadModal() {
  _uploadFile = null;
  document.getElementById("upload-file-input").value    = "";
  document.getElementById("upload-course-name").value   = "";
  document.getElementById("upload-category").value      = "";
  document.getElementById("upload-difficulty").value    = "beginner";
  document.getElementById("upload-btn").disabled        = true;
  document.getElementById("upload-error").classList.add("hidden");
  document.getElementById("text-preview-wrap").classList.add("hidden");
  document.getElementById("file-chosen").classList.add("hidden");
  document.getElementById("drop-zone-inner").classList.remove("hidden");
}

/** Wire up file input, drag-and-drop on the modal drop zone. */
document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("upload-file-input");
  const dropZone  = document.getElementById("drop-zone");

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files[0]) _setUploadFile(fileInput.files[0]);
    });
  }

  if (dropZone) {
    dropZone.addEventListener("dragover", e => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });
    dropZone.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const f = e.dataTransfer.files[0];
      if (f) _setUploadFile(f);
    });
  }

  // Close modal on backdrop click
  const overlay = document.getElementById("upload-modal");
  if (overlay) {
    overlay.addEventListener("click", e => {
      if (e.target === overlay) hideUploadModal();
    });
  }

  // Close on Escape
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") hideUploadModal();
  });
});

function _setUploadFile(file) {
  const allowed = ["application/pdf", "text/plain", "text/markdown"];
  const ext     = file.name.split(".").pop().toLowerCase();
  if (!["pdf", "txt", "md"].includes(ext)) {
    _showUploadError("Only PDF, TXT, and MD files are allowed.");
    return;
  }

  _uploadFile = file;

  // Show file chosen state
  document.getElementById("drop-zone-inner").classList.add("hidden");
  document.getElementById("file-chosen").classList.remove("hidden");
  document.getElementById("chosen-name").textContent = file.name;
  document.getElementById("upload-btn").disabled     = false;
  document.getElementById("upload-error").classList.add("hidden");

  // Auto-fill course name from filename
  const nameInput = document.getElementById("upload-course-name");
  if (nameInput && !nameInput.value.trim()) {
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    nameInput.value = _toTitleCase(base);
  }
}

function clearFile() {
  _uploadFile = null;
  document.getElementById("upload-file-input").value = "";
  document.getElementById("file-chosen").classList.add("hidden");
  document.getElementById("drop-zone-inner").classList.remove("hidden");
  document.getElementById("upload-btn").disabled = true;
  document.getElementById("text-preview-wrap").classList.add("hidden");
}

/** Upload file → backend → redirect to new course page. */
async function handleUpload() {
  if (!_uploadFile) return;

  const btn = document.getElementById("upload-btn");
  btn.disabled  = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Uploading…';
  document.getElementById("upload-error").classList.add("hidden");

  const fd = new FormData();
  fd.append("file",        _uploadFile);
  fd.append("course_name", document.getElementById("upload-course-name").value.trim());
  fd.append("category",    document.getElementById("upload-category").value.trim());
  fd.append("difficulty",  document.getElementById("upload-difficulty").value);

  try {
    const data = await API.upload("/api/upload", fd);

    // Show extracted text preview briefly
    const preview = document.getElementById("text-preview-wrap");
    const preBox  = document.getElementById("text-preview");
    if (preview && preBox && data.extracted_text_preview) {
      preBox.textContent = data.extracted_text_preview;
      preview.classList.remove("hidden");
    }

    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Generating modules…';

    // Auto-generate modules for the new course
    try {
      await API.post(`/api/courses/${data.course_id}/generate-modules`);
    } catch (_) {
      // Non-fatal — user can generate from course page
    }

    // Small delay so user sees the preview
    await _sleep(800);

    // Navigate to the new course
    window.location.href = `/course/${data.course_id}`;

  } catch (err) {
    _showUploadError(err.message);
    btn.disabled  = false;
    btn.innerHTML = '<i class="fa fa-magic"></i> Upload &amp; Generate Course';
  }
}

function _showUploadError(msg) {
  const el = document.getElementById("upload-error");
  if (el) {
    el.textContent = msg;
    el.classList.remove("hidden");
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   SMALL UTILITIES (home page scope)
══════════════════════════════════════════════════════════════════════════════ */
function _esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function _toTitleCase(str) {
  return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}