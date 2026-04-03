# routes/courses.py — Course listing, search, and detail endpoints
import json
import logging
from flask import Blueprint, jsonify, render_template, request
from db import query, execute

logger    = logging.getLogger(__name__)
courses_bp = Blueprint("courses", __name__)


# ── Home page ─────────────────────────────────────────────────────────────────
@courses_bp.route("/")
def index():
    """Render the home page (course grid loaded via JS)."""
    return render_template("index.html")


# ── Course detail page ────────────────────────────────────────────────────────
@courses_bp.route("/course/<int:course_id>")
def course_detail(course_id):
    """Render the course learning hub page."""
    course = query(
        "SELECT * FROM courses WHERE id = ?", (course_id,), one=True
    )
    if not course:
        return render_template("404.html"), 404
    return render_template("course.html", course=course)


# ── API: list / search courses ────────────────────────────────────────────────
@courses_bp.route("/api/courses")
def api_courses():
    """
    GET /api/courses?q=python&category=Programming&difficulty=beginner
    Returns JSON list of courses matching optional filters.
    """
    q          = request.args.get("q", "").strip().lower()
    category   = request.args.get("category", "").strip()
    difficulty = request.args.get("difficulty", "").strip()

    sql    = "SELECT * FROM courses WHERE 1=1"
    params = []

    if q:
        sql    += " AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tags) LIKE ?)"
        like    = f"%{q}%"
        params += [like, like, like]

    if category:
        sql    += " AND category = ?"
        params.append(category)

    if difficulty:
        sql    += " AND difficulty = ?"
        params.append(difficulty)

    sql += " ORDER BY created_at DESC"

    rows = query(sql, params)

    # Parse tags JSON for each row
    for row in rows:
        try:
            row["tags"] = json.loads(row.get("tags") or "[]")
        except (json.JSONDecodeError, TypeError):
            row["tags"] = []

    return jsonify({"courses": rows, "count": len(rows)})


# ── API: single course ────────────────────────────────────────────────────────
@courses_bp.route("/api/courses/<int:course_id>")
def api_course(course_id):
    """GET /api/courses/<id> — full course data including modules."""
    course = query(
        "SELECT * FROM courses WHERE id = ?", (course_id,), one=True
    )
    if not course:
        return jsonify({"error": "Course not found"}), 404

    try:
        course["tags"] = json.loads(course.get("tags") or "[]")
    except (json.JSONDecodeError, TypeError):
        course["tags"] = []

    # Attach modules if they exist
    modules = query(
        "SELECT * FROM modules WHERE course_id = ? ORDER BY order_index",
        (course_id,),
    )
    for m in modules:
        try:
            m["subtopics"] = json.loads(m.get("subtopics") or "[]")
        except (json.JSONDecodeError, TypeError):
            m["subtopics"] = []

    course["modules"] = modules
    return jsonify(course)


# ── API: list categories ──────────────────────────────────────────────────────
@courses_bp.route("/api/categories")
def api_categories():
    """GET /api/categories — distinct categories for filter chips."""
    rows = query("SELECT DISTINCT category FROM courses WHERE category IS NOT NULL ORDER BY category")
    return jsonify({"categories": [r["category"] for r in rows]})


# ── API: create course (used after upload + module generation) ────────────────
@courses_bp.route("/api/courses", methods=["POST"])
def api_create_course():
    """
    POST /api/courses
    Body: { title, description, category, difficulty, tags[] }
    """
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400

    tags = json.dumps(data.get("tags") or [])
    course_id = execute(
        """INSERT INTO courses (title, description, category, difficulty, tags)
           VALUES (?, ?, ?, ?, ?)""",
        (
            title,
            data.get("description", ""),
            data.get("category", "General"),
            data.get("difficulty", "beginner"),
            tags,
        ),
    )
    logger.info("Created course id=%s title=%s", course_id, title)
    return jsonify({"course_id": course_id, "message": "Course created"}), 201


# ── API: course modules ───────────────────────────────────────────────────────
@courses_bp.route("/api/courses/<int:course_id>/modules")
def api_course_modules(course_id):
    """GET /api/courses/<id>/modules — ordered module list."""
    modules = query(
        "SELECT * FROM modules WHERE course_id = ? ORDER BY order_index",
        (course_id,),
    )
    for m in modules:
        try:
            m["subtopics"] = json.loads(m.get("subtopics") or "[]")
        except (json.JSONDecodeError, TypeError):
            m["subtopics"] = []
    return jsonify({"modules": modules})