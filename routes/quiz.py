# routes/quiz.py — Quiz generation, session management, and AI evaluation
import json
import logging
from flask import Blueprint, jsonify, request
from db import query, execute
import ai_service

logger  = logging.getLogger(__name__)
quiz_bp = Blueprint("quiz", __name__)


def _get_course_or_404(course_id: int):
    course = query("SELECT * FROM courses WHERE id = ?", (course_id,), one=True)
    if not course:
        return None, (jsonify({"error": "Course not found"}), 404)
    return course, None


# Generate a fresh quiz
@quiz_bp.route("/api/courses/<int:course_id>/generate-quiz", methods=["POST"])
def api_generate_quiz(course_id):
    """
    POST /api/courses/<id>/generate-quiz
    Body: { quiz_type, count, module_id (optional) }
    Returns: { session_id, questions, quiz_type, topic, count }
    """
    course, err = _get_course_or_404(course_id)
    if err:
        return err

    data      = request.get_json(silent=True) or {}
    quiz_type = data.get("quiz_type", "objective")
    count     = max(2, min(int(data.get("count", 5)), 10))
    module_id = data.get("module_id")

    if quiz_type not in ("objective", "subjective"):
        return jsonify({"error": "quiz_type must be 'objective' or 'subjective'"}), 400

    topic = course["title"]
    if module_id:
        mod = query(
            "SELECT * FROM modules WHERE id=? AND course_id=?",
            (module_id, course_id), one=True
        )
        if mod:
            topic = f"{course['title']} — {mod['title']}"

    try:
        questions = ai_service.generate_quiz(topic, quiz_type, count)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    if not questions:
        return jsonify({"error": "AI returned no questions. Please try again."}), 502

    session_id = execute(
        "INSERT INTO quiz_sessions (course_id, quiz_type, questions) VALUES (?, ?, ?)",
        (course_id, quiz_type, json.dumps(questions)),
    )

    frontend_questions = _strip_answers(questions, quiz_type)

    logger.info(
        "Generated quiz session_id=%s course_id=%s type=%s count=%d",
        session_id, course_id, quiz_type, len(questions),
    )

    return jsonify({
        "session_id": session_id,
        "quiz_type":  quiz_type,
        "topic":      topic,
        "questions":  frontend_questions,
        "count":      len(frontend_questions),
    })


def _strip_answers(questions: list, quiz_type: str) -> list:
    """Remove answer keys before sending to frontend."""
    safe = []
    for i, q in enumerate(questions):
        if quiz_type == "objective":
            safe.append({
                "index":    i + 1,
                "question": q.get("question", ""),
                "hint":     q.get("hint", ""),
            })
        else:
            safe.append({
                "index":    i + 1,
                "question": q.get("question", ""),
            })
    return safe


# Evaluate submitted answers
@quiz_bp.route("/api/quiz/<int:session_id>/evaluate", methods=["POST"])
def api_evaluate_quiz(session_id):
    """
    POST /api/quiz/<session_id>/evaluate
    Body: { answers: ["answer1", "answer2", ...] }
    Returns full evaluation with per-question feedback.
    """
    session = query(
        "SELECT * FROM quiz_sessions WHERE id = ?", (session_id,), one=True
    )
    if not session:
        return jsonify({"error": "Quiz session not found"}), 404

    # Return cached evaluation if already done
    if session.get("evaluation"):
        try:
            cached = json.loads(session["evaluation"])
            return jsonify({**cached, "cached": True})
        except (json.JSONDecodeError, TypeError):
            pass

    data         = request.get_json(silent=True) or {}
    user_answers = data.get("answers", [])

    try:
        questions = json.loads(session["questions"])
    except (json.JSONDecodeError, TypeError):
        return jsonify({"error": "Could not load quiz questions from session"}), 500

    if len(user_answers) != len(questions):
        return jsonify({
            "error": (
                f"Expected {len(questions)} answers, "
                f"got {len(user_answers)}. Please answer every question."
            )
        }), 400

    course = query(
        "SELECT title FROM courses WHERE id=?",
        (session["course_id"],), one=True
    )
    topic = (course or {}).get("title", "the topic")

    try:
        evaluation = ai_service.evaluate_quiz(
            topic, session["quiz_type"], questions, user_answers
        )
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 502

    pct   = evaluation.get("percentage", 0)
    grade = _letter_grade(pct)
    evaluation["grade"] = grade

    execute(
        "UPDATE quiz_sessions SET answers=?, evaluation=?, score=? WHERE id=?",
        (
            json.dumps(user_answers),
            json.dumps(evaluation),
            evaluation.get("total_score", 0),
            session_id,
        ),
    )

    logger.info(
        "Evaluated session_id=%s score=%.1f%% grade=%s",
        session_id, pct, grade,
    )
    return jsonify(evaluation)


def _letter_grade(pct: float) -> str:
    if pct >= 90: return "A"
    if pct >= 75: return "B"
    if pct >= 60: return "C"
    if pct >= 40: return "D"
    return "F"


# Get quiz session (result review)
@quiz_bp.route("/api/quiz/<int:session_id>")
def api_get_quiz_session(session_id):
    """GET /api/quiz/<session_id> — retrieve a completed quiz session."""
    session = query(
        "SELECT * FROM quiz_sessions WHERE id = ?", (session_id,), one=True
    )
    if not session:
        return jsonify({"error": "Session not found"}), 404

    try:
        session["questions"] = _strip_answers(
            json.loads(session["questions"]),
            session["quiz_type"],
        )
    except (json.JSONDecodeError, TypeError):
        session["questions"] = []

    if session.get("evaluation"):
        try:
            session["evaluation"] = json.loads(session["evaluation"])
        except (json.JSONDecodeError, TypeError):
            session["evaluation"] = None

    if session.get("answers"):
        try:
            session["answers"] = json.loads(session["answers"])
        except (json.JSONDecodeError, TypeError):
            session["answers"] = []

    return jsonify(session)


# Quiz history for a course
@quiz_bp.route("/api/courses/<int:course_id>/quiz-history")
def api_quiz_history(course_id):
    """GET /api/courses/<id>/quiz-history — last 10 quiz attempts."""
    rows = query(
        """SELECT id, quiz_type, score, created_at
           FROM quiz_sessions
           WHERE course_id = ?
           ORDER BY created_at DESC
           LIMIT 10""",
        (course_id,),
    )
    return jsonify({"history": rows})