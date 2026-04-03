// quiz.js — Full quiz engine: setup, question flow, AI evaluation, results
"use strict";

const Quiz = (() => {

  /* ── State ────────────────────────────────────────────────────────────── */
  let _sessionId = null;
  let _quizType  = null;
  let _questions = [];
  let _answers   = [];
  let _current   = 0;
  let _hintShown = false;

  /* ── Show/hide screens ────────────────────────────────────────────────── */
  function _show(id) {
    ["quiz-setup", "quiz-active", "quiz-results"].forEach(s => {
      const el = document.getElementById(s);
      if (el) el.classList.toggle("hidden", s !== id);
    });
  }

  /* ── Wire type-card clicks after DOM ready ────────────────────────────── */
  function _initCards() {
    const obj  = document.getElementById("type-card-objective");
    const subj = document.getElementById("type-card-subjective");
    if (obj)  obj.addEventListener("click",  () => selectType("objective"));
    if (subj) subj.addEventListener("click", () => selectType("subjective"));
  }

  /* ══════════════════════════════════════════════════════════════════════
     SELECT QUIZ TYPE
  ══════════════════════════════════════════════════════════════════════ */
  function selectType(type) {
    _quizType = type;

    ["objective", "subjective"].forEach(t => {
      const card  = document.getElementById(`type-card-${t}`);
      const check = card ? card.querySelector(".quiz-type-check") : null;
      if (card)  card.classList.toggle("active", t === type);
      if (check) check.classList.toggle("hidden", t !== type);
    });

    // Always enable the start button once a type is chosen
    const btn = document.getElementById("start-quiz-btn");
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor  = "pointer";
    }

    showToast(`Selected: ${type === "objective" ? "Fill in the Blanks" : "Short Answer"}`, "success");
  }

  /* ══════════════════════════════════════════════════════════════════════
     START QUIZ
  ══════════════════════════════════════════════════════════════════════ */
  async function start() {
    if (!_quizType) {
      showToast("Please click a quiz type card first (Fill in Blanks or Short Answer).", "error");
      // Visually pulse the cards to guide user
      document.querySelectorAll(".quiz-type-card").forEach(c => {
        c.style.borderColor = "var(--accent)";
        setTimeout(() => c.style.borderColor = "", 1500);
      });
      return;
    }

    const countEl = document.getElementById("quiz-count");
    const count   = countEl ? parseInt(countEl.value, 10) : 5;

    showLoader("Generating fresh quiz questions…");

    try {
      const payload = {
        quiz_type: _quizType,
        count:     count,
      };

      // Add module_id if one is selected on the course page
      if (typeof activeModuleId !== "undefined" && activeModuleId) {
        payload.module_id = activeModuleId;
      }

      const data = await API.post(
        `/api/courses/${COURSE_ID}/generate-quiz`,
        payload
      );

      _sessionId = data.session_id;
      _questions = data.questions || [];
      _answers   = new Array(_questions.length).fill("");
      _current   = 0;

      if (!_questions.length) {
        showToast("AI returned no questions — please try again.", "error");
        return;
      }

      _show("quiz-active");
      _renderQuestion(0);
      showToast(`${_questions.length} fresh questions loaded!`, "success");

    } catch (err) {
      showToast("Quiz generation failed: " + err.message, "error");
    } finally {
      hideLoader();
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     RENDER QUESTION
  ══════════════════════════════════════════════════════════════════════ */
  function _renderQuestion(idx) {
    const q     = _questions[idx];
    const total = _questions.length;

    // Progress bar
    const bar = document.getElementById("quiz-progress-bar");
    if (bar) bar.style.width = ((idx / total) * 100) + "%";

    const cur = document.getElementById("q-current");
    const tot = document.getElementById("q-total");
    if (cur) cur.textContent = idx + 1;
    if (tot) tot.textContent = total;

    // Type label
    const typeLabel = document.getElementById("q-type-label");
    if (typeLabel) {
      typeLabel.textContent = _quizType === "objective"
        ? "✏️ Fill in the Blank"
        : "📝 Short Answer";
    }

    // Question text — make blank marker obvious
    const qText = document.getElementById("question-text");
    if (qText) {
      let displayQ = q.question || "";
      if (_quizType === "objective") {
        displayQ = displayQ.replace(/___+/g, "________");
      }
      qText.textContent = displayQ;
    }

    // Hint
    const hintEl  = document.getElementById("question-hint");
    const hintBtn = document.getElementById("hint-btn");
    if (hintEl) {
      hintEl.textContent = q.hint || "";
      hintEl.classList.add("hidden");
    }
    if (hintBtn) {
      const hasHint = _quizType === "objective" && q.hint;
      hintBtn.classList.toggle("hidden", !hasHint);
      hintBtn.innerHTML = '<i class="fa fa-lightbulb"></i> Show Hint';
    }
    _hintShown = false;

    // Show correct input
    const objInput  = document.getElementById("obj-answer");
    const subjInput = document.getElementById("subj-answer");

    if (_quizType === "objective") {
      if (objInput) {
        objInput.classList.remove("hidden");
        objInput.value = _answers[idx] || "";
        setTimeout(() => objInput.focus(), 50);
      }
      if (subjInput) subjInput.classList.add("hidden");
    } else {
      if (subjInput) {
        subjInput.classList.remove("hidden");
        subjInput.value = _answers[idx] || "";
        setTimeout(() => subjInput.focus(), 50);
      }
      if (objInput) objInput.classList.add("hidden");
    }

    // Last question — change button text
    const nextBtn = document.getElementById("next-q-btn");
    if (nextBtn) {
      nextBtn.innerHTML = idx === total - 1
        ? 'Submit Quiz <i class="fa fa-check"></i>'
        : 'Next <i class="fa fa-arrow-right"></i>';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     NAVIGATION
  ══════════════════════════════════════════════════════════════════════ */
  function _saveCurrentAnswer() {
    const input = _quizType === "objective"
      ? document.getElementById("obj-answer")
      : document.getElementById("subj-answer");
    if (input) _answers[_current] = input.value.trim();
  }

  function next() {
    _saveCurrentAnswer();

    if (_current < _questions.length - 1) {
      _current++;
      _renderQuestion(_current);
    } else {
      _submitQuiz();
    }
  }

  function toggleHint() {
    const hintEl  = document.getElementById("question-hint");
    const hintBtn = document.getElementById("hint-btn");
    if (!hintEl) return;
    _hintShown = !_hintShown;
    hintEl.classList.toggle("hidden", !_hintShown);
    if (hintBtn) {
      hintBtn.innerHTML = _hintShown
        ? '<i class="fa fa-eye-slash"></i> Hide Hint'
        : '<i class="fa fa-lightbulb"></i> Show Hint';
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     SUBMIT + EVALUATE
  ══════════════════════════════════════════════════════════════════════ */
  async function _submitQuiz() {
    const blanks = _answers.filter(a => !a).length;
    if (blanks > 0) {
      const go = confirm(
        `You left ${blanks} question${blanks > 1 ? "s" : ""} blank. Submit anyway?`
      );
      if (!go) return;
    }

    showLoader("AI is evaluating your answers…");

    try {
      const result = await API.post(
        `/api/quiz/${_sessionId}/evaluate`,
        { answers: _answers }
      );
      _renderResults(result);
      _show("quiz-results");
    } catch (err) {
      showToast("Evaluation failed: " + err.message, "error");
    } finally {
      hideLoader();
    }
  }

  /* ══════════════════════════════════════════════════════════════════════
     RESULTS
  ══════════════════════════════════════════════════════════════════════ */
  function _renderResults(data) {
    const pct     = Math.round(data.percentage || 0);
    const grade   = data.grade || "F";
    const results = data.results || [];

    // Score circle colour by grade
    const circle  = document.getElementById("score-circle");
    const colours = { A: "#00c9a7", B: "#6c63ff", C: "#f59e0b", D: "#f97316", F: "#ff6b6b" };
    if (circle) {
      const col = colours[grade] || "#6c63ff";
      circle.style.background = `linear-gradient(135deg, ${col}, ${col}99)`;
    }

    _setText("score-pct",      pct + "%");
    _setText("score-grade",    grade);
    _setText("score-title",    _gradeTitle(grade));
    _setText("score-feedback", data.feedback || "");

    const correct = results.filter(r => r.correct).length;
    _setText("stat-correct", correct);
    _setText("stat-wrong",   results.length - correct);

    // Per-question breakdown
    const breakdown = document.getElementById("results-breakdown");
    if (breakdown) {
      breakdown.innerHTML = results.map((r, i) => {
        const isOk     = r.correct;
        const iconName = isOk ? "fa-circle-check" : "fa-circle-xmark";
        const scoreStr = r.score !== undefined
          ? `<span style="color:var(--text-muted);font-size:0.78rem">
               (${Math.round((r.score || 0) * 100)}%)
             </span>`
          : "";

        return `
          <div class="result-item ${isOk ? "correct" : "wrong"}">
            <div class="result-header">
              <i class="fa ${iconName} result-icon ${isOk ? "correct" : "wrong"}"></i>
              <span class="result-q">
                Q${i + 1}: ${_esc(r.question || (_questions[i] ? _questions[i].question : ""))}
              </span>
              ${scoreStr}
            </div>
            <div class="result-your">
              Your answer: <span>${_esc(r.user_answer || "(blank)")}</span>
            </div>
            <div class="result-explanation">
              <i class="fa fa-info-circle" style="color:var(--primary);margin-right:6px"></i>
              ${_esc(r.explanation || "")}
            </div>
          </div>`;
      }).join("");
    }

    // Fill progress bar
    const bar = document.getElementById("quiz-progress-bar");
    if (bar) bar.style.width = "100%";
  }

  function _gradeTitle(grade) {
    return {
      A: "Excellent work! 🎉",
      B: "Great job! 👏",
      C: "Good effort! 💪",
      D: "Keep practising! 📚",
      F: "Don't give up! 🔄",
    }[grade] || "Quiz Complete!";
  }

  /* ══════════════════════════════════════════════════════════════════════
     RESET
  ══════════════════════════════════════════════════════════════════════ */
  function reset() {
    _sessionId = null;
    _questions = [];
    _answers   = [];
    _current   = 0;
    _quizType  = null;

    ["objective", "subjective"].forEach(t => {
      const card  = document.getElementById(`type-card-${t}`);
      const check = card ? card.querySelector(".quiz-type-check") : null;
      if (card)  card.classList.remove("active");
      if (check) check.classList.add("hidden");
    });

    const btn = document.getElementById("start-quiz-btn");
    if (btn) {
      btn.disabled      = false;
      btn.style.opacity = "1";
    }

    _show("quiz-setup");
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function _esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g,  "&amp;")
      .replace(/</g,  "&lt;")
      .replace(/>/g,  "&gt;")
      .replace(/"/g,  "&quot;");
  }

  /* ── Init on DOM ready ────────────────────────────────────────────────── */
  document.addEventListener("DOMContentLoaded", _initCards);

  /* ── Public ───────────────────────────────────────────────────────────── */
  return { selectType, start, next, toggleHint, reset };

})();

/* ── Global shims for inline onclick handlers in course.html ──────────────── */
function selectQuizType(type) { Quiz.selectType(type); }
function startQuiz()          { Quiz.start();           }
function nextQuestion()       { Quiz.next();            }
function toggleHint()         { Quiz.toggleHint();      }
function resetQuiz()          { Quiz.reset();           }