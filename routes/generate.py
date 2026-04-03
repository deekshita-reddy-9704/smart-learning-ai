# routes/generate.py — AI content generation endpoints
import json
import logging
from flask import Blueprint, jsonify, request
from db import query, execute
import ai_service

logger      = logging.getLogger(__name__)
generate_bp = Blueprint("generate", __name__)


def _get_course_or_404(course_id: int):
    """Fetch course row or return (None, error_response)."""
    course = query("SELECT * FROM courses WHERE id = ?", (course_id,), one=True)
    if not course:
        return None, (jsonify({"error": "Course not found"}), 404)
    return course, None


def _get_syllabus_text(course_id: int) -> str:
    """Return the extracted syllabus text for a course, or empty string."""
    row = query(
        "SELECT raw_text FROM syllabi WHERE course_id = ? ORDER BY created_at DESC LIMIT 1",
        (course_id,),
        one=True,
    )
    return (row or {}).get("raw_text") or ""


# ── Generate modules (topic breakdown) ───────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/generate-modules", methods=["POST"])
def api_generate_modules(course_id):
    """
    POST /api/courses/<id>/generate-modules
    Generates 5-7 micro-learning modules and stores them in the DB.
    Deletes any previously generated modules for this course first.
    Returns: { modules: [...] }
    """
    course, err = _get_course_or_404(course_id)
    if err:
        return err

    syllabus_text = _get_syllabus_text(course_id)

    try:
        modules = ai_service.generate_modules(course["title"], syllabus_text)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    # ── Wipe old modules for a clean regeneration ─────────────────────────────
    execute("DELETE FROM modules WHERE course_id = ?", (course_id,))

    saved = []
    for m in modules:
        mid = execute(
            """INSERT INTO modules (course_id, title, description, order_index, subtopics)
               VALUES (?, ?, ?, ?, ?)""",
            (
                course_id,
                m.get("title", "Untitled Module"),
                m.get("description", ""),
                m.get("order_index", 0),
                json.dumps(m.get("subtopics", [])),
            ),
        )
        m["id"]        = mid
        m["course_id"] = course_id
        saved.append(m)

    logger.info("Generated %d modules for course_id=%s", len(saved), course_id)
    return jsonify({"modules": saved, "count": len(saved)})


# ── Generate notes ────────────────────────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/generate-notes", methods=["POST"])
def api_generate_notes(course_id):
    """
    POST /api/courses/<id>/generate-notes
    Body (optional): { module_id: int }
    Returns: { notes_id, content }
    """
    course, err = _get_course_or_404(course_id)
    if err:
        return err

    data      = request.get_json(silent=True) or {}
    module_id = data.get("module_id")
    module_title = ""

    if module_id:
        mod = query("SELECT * FROM modules WHERE id = ? AND course_id = ?",
                    (module_id, course_id), one=True)
        if mod:
            module_title = mod["title"]

    try:
        content = ai_service.generate_notes(course["title"], module_title)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    notes_id = execute(
        """INSERT INTO notes (course_id, module_id, content)
           VALUES (?, ?, ?)""",
        (course_id, module_id, content),
    )

    return jsonify({
        "notes_id":     notes_id,
        "content":      content,
        "module_title": module_title,
    })


# ── Get latest notes ──────────────────────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/notes")
def api_get_notes(course_id):
    """GET /api/courses/<id>/notes?module_id=<int> — latest notes for course/module."""
    module_id = request.args.get("module_id", type=int)

    if module_id:
        row = query(
            "SELECT * FROM notes WHERE course_id=? AND module_id=? ORDER BY created_at DESC LIMIT 1",
            (course_id, module_id), one=True,
        )
    else:
        row = query(
            "SELECT * FROM notes WHERE course_id=? ORDER BY created_at DESC LIMIT 1",
            (course_id,), one=True,
        )

    if not row:
        return jsonify({"error": "No notes found. Generate them first."}), 404
    return jsonify(row)


# ── Generate flashcards ───────────────────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/generate-flashcards", methods=["POST"])
def api_generate_flashcards(course_id):
    """
    POST /api/courses/<id>/generate-flashcards
    Body (optional): { module_id: int, count: int }
    Returns: { flashcards: [...] }
    """
    course, err = _get_course_or_404(course_id)
    if err:
        return err

    data      = request.get_json(silent=True) or {}
    module_id = data.get("module_id")
    count     = min(int(data.get("count", 10)), 20)   # cap at 20

    topic = course["title"]
    if module_id:
        mod = query("SELECT * FROM modules WHERE id = ? AND course_id = ?",
                    (module_id, course_id), one=True)
        if mod:
            topic = f"{course['title']} — {mod['title']}"

    try:
        cards = ai_service.generate_flashcards(topic, count)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    # Delete old cards for this course/module before saving new ones
    if module_id:
        execute("DELETE FROM flashcards WHERE course_id=? AND module_id=?",
                (course_id, module_id))
    else:
        execute("DELETE FROM flashcards WHERE course_id=? AND module_id IS NULL",
                (course_id,))

    saved = []
    for c in cards:
        fid = execute(
            "INSERT INTO flashcards (course_id, module_id, question, answer) VALUES (?, ?, ?, ?)",
            (course_id, module_id, c.get("question", ""), c.get("answer", "")),
        )
        c["id"]        = fid
        c["course_id"] = course_id
        saved.append(c)

    return jsonify({"flashcards": saved, "count": len(saved)})


# ── Get flashcards ────────────────────────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/flashcards")
def api_get_flashcards(course_id):
    """GET /api/courses/<id>/flashcards?module_id=<int>"""
    module_id = request.args.get("module_id", type=int)

    if module_id:
        rows = query(
            "SELECT * FROM flashcards WHERE course_id=? AND module_id=? ORDER BY id",
            (course_id, module_id),
        )
    else:
        rows = query(
            "SELECT * FROM flashcards WHERE course_id=? ORDER BY id",
            (course_id,),
        )

    return jsonify({"flashcards": rows, "count": len(rows)})


# ── Generate exercises (kinesthetic) ─────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/generate-exercises", methods=["POST"])
def api_generate_exercises(course_id):
    """
    POST /api/courses/<id>/generate-exercises
    Body (optional): { module_id: int, count: int }
    Returns: { exercises: [...] }
    """
    course, err = _get_course_or_404(course_id)
    if err:
        return err

    data      = request.get_json(silent=True) or {}
    module_id = data.get("module_id")
    count     = min(int(data.get("count", 3)), 6)

    topic = course["title"]
    if module_id:
        mod = query("SELECT * FROM modules WHERE id = ? AND course_id = ?",
                    (module_id, course_id), one=True)
        if mod:
            topic = f"{course['title']} — {mod['title']}"

    try:
        exercises = ai_service.generate_exercises(topic, count)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"exercises": exercises, "count": len(exercises)})


# ── Generate visual tree ──────────────────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/generate-visual", methods=["POST"])
def api_generate_visual(course_id):
    """
    POST /api/courses/<id>/generate-visual
    Returns a D3-ready JSON tree: { name, children: [...] }
    """
    course, err = _get_course_or_404(course_id)
    if err:
        return err

    modules = query(
        "SELECT * FROM modules WHERE course_id=? ORDER BY order_index",
        (course_id,),
    )
    for m in modules:
        try:
            m["subtopics"] = json.loads(m.get("subtopics") or "[]")
        except (json.JSONDecodeError, TypeError):
            m["subtopics"] = []

    try:
        tree = ai_service.generate_visual_tree(course["title"], modules)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify({"tree": tree})


# ── Generate writing prompt ───────────────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/generate-writing", methods=["POST"])
def api_generate_writing(course_id):
    """
    POST /api/courses/<id>/generate-writing
    Body (optional): { module_id: int }
    Returns: { prompt, ghost_text }
    """
    course, err = _get_course_or_404(course_id)
    if err:
        return err

    data         = request.get_json(silent=True) or {}
    module_id    = data.get("module_id")
    module_title = ""

    if module_id:
        mod = query("SELECT * FROM modules WHERE id=? AND course_id=?",
                    (module_id, course_id), one=True)
        if mod:
            module_title = mod["title"]

    try:
        result = ai_service.generate_writing_prompt(course["title"], module_title)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    return jsonify(result)


# ── Text-to-speech notes ──────────────────────────────────────────────────────
@generate_bp.route("/api/courses/<int:course_id>/tts", methods=["POST"])
def api_tts(course_id):
    """
    POST /api/courses/<id>/tts
    Body: { text: str }
    Strips markdown formatting before converting to speech.
    """
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()

    if not text:
        return jsonify({"error": "No text provided"}), 400

    # ── Strip all markdown formatting before TTS ──────────────────────────
    import re

    # Remove code blocks first (``` ... ```)
    text = re.sub(r'```[\s\S]*?```', ' code block omitted ', text)
    # Remove inline code (`code`)
    text = re.sub(r'`[^`]+`', '', text)
    # Remove headings (## Heading → "Heading")
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove bold/italic (***text***, **text**, *text*, __text__, _text_)
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,2}([^_]+)_{1,2}', r'\1', text)
    # Remove blockquotes (> text)
    text = re.sub(r'^\s*>\s+', '', text, flags=re.MULTILINE)
    # Remove horizontal rules (---, ***, ___)
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    # Remove links [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    # Remove images ![alt](url)
    text = re.sub(r'!\[[^\]]*\]\([^\)]+\)', '', text)
    # Remove bullet points and list markers (-, *, +, 1.)
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Collapse multiple blank lines into one
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Clean up extra whitespace
    text = re.sub(r'[ \t]+', ' ', text).strip()

    # Truncate very long text
    if len(text) > 3000:
        text = text[:3000] + ". End of preview."

    try:
        from gtts import gTTS
        import io
        tts = gTTS(text=text, lang="en", slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        from flask import send_file
        return send_file(
            buf,
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name="notes_audio.mp3",
        )
    except ImportError:
        return jsonify({
            "error": "gTTS not installed.",
            "fallback": "browser_tts",
        }), 501
    except Exception as e:
        logger.error("TTS error: %s", e)
        return jsonify({"error": f"TTS failed: {str(e)}"}), 500