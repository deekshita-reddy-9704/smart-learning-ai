# routes/upload.py — PDF / text syllabus upload and text extraction
import os
import uuid
import logging
import json
from flask import Blueprint, jsonify, request, current_app
from werkzeug.utils import secure_filename
from db import execute, query
from config import Config

logger    = logging.getLogger(__name__)
upload_bp = Blueprint("upload", __name__)


def _allowed_file(filename: str) -> bool:
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in Config.ALLOWED_EXTENSIONS
    )


def _extract_text_from_pdf(filepath: str) -> str:
    """
    Extract plain text from a PDF using PyMuPDF (fitz).
    Falls back to pdfminer if fitz is unavailable.
    Returns extracted text string (may be empty for scanned PDFs).
    """
    # ── Try PyMuPDF first ────────────────────────────────────────────────────
    try:
        import fitz  # PyMuPDF
        doc   = fitz.open(filepath)
        pages = [page.get_text() for page in doc]
        doc.close()
        text = "\n\n".join(pages).strip()
        if text:
            logger.info("Extracted %d chars via PyMuPDF", len(text))
            return text
    except ImportError:
        logger.warning("PyMuPDF not installed, trying pdfminer")
    except Exception as e:
        logger.error("PyMuPDF error: %s", e)

    # ── Fallback: pdfminer ───────────────────────────────────────────────────
    try:
        from pdfminer.high_level import extract_text as pdfminer_extract
        text = pdfminer_extract(filepath).strip()
        if text:
            logger.info("Extracted %d chars via pdfminer", len(text))
            return text
    except ImportError:
        logger.warning("pdfminer not installed either")
    except Exception as e:
        logger.error("pdfminer error: %s", e)

    return ""


def _extract_text(filepath: str, filename: str) -> str:
    """Route text extraction based on file extension."""
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext == "pdf":
        return _extract_text_from_pdf(filepath)
    # txt / md — just read
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            return f.read().strip()
    except Exception as e:
        logger.error("Text read error: %s", e)
        return ""


# ── Upload endpoint ───────────────────────────────────────────────────────────
@upload_bp.route("/api/upload", methods=["POST"])
def api_upload():
    """
    POST /api/upload
    Form data:
      file        — PDF or text file
      course_name — name for the new course (optional, defaults to filename)
      category    — course category (optional)
      difficulty  — beginner | intermediate | advanced (optional)

    Returns: { course_id, syllabus_id, extracted_text_preview, filename }
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part in request"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not _allowed_file(file.filename):
        return jsonify({
            "error": f"File type not allowed. Upload PDF, TXT, or MD files."
        }), 400

    # ── Save file with unique name to prevent collisions ─────────────────────
    original_name = secure_filename(file.filename)
    unique_name   = f"{uuid.uuid4().hex}_{original_name}"
    filepath      = os.path.join(Config.UPLOAD_FOLDER, unique_name)

    try:
        file.save(filepath)
        logger.info("Saved upload: %s", filepath)
    except Exception as e:
        logger.error("File save error: %s", e)
        return jsonify({"error": "Failed to save file"}), 500

    # ── Extract text ──────────────────────────────────────────────────────────
    raw_text = _extract_text(filepath, original_name)
    if not raw_text:
        # Don't delete the file — user may want to retry
        return jsonify({
            "error": (
                "Could not extract text from the file. "
                "If it is a scanned PDF, please convert it to text first."
            )
        }), 422

    # ── Create a new course record ────────────────────────────────────────────
    course_name = (request.form.get("course_name") or "").strip()
    if not course_name:
        # Derive from filename: "machine_learning_notes.pdf" → "Machine Learning Notes"
        base        = original_name.rsplit(".", 1)[0]
        course_name = base.replace("_", " ").replace("-", " ").title()

    course_id = execute(
        """INSERT INTO courses (title, description, category, difficulty, tags)
           VALUES (?, ?, ?, ?, ?)""",
        (
            course_name,
            f"Course generated from uploaded file: {original_name}",
            request.form.get("category", "Uploaded"),
            request.form.get("difficulty", "beginner"),
            json.dumps(["uploaded", "custom"]),
        ),
    )

    # ── Store syllabus record ─────────────────────────────────────────────────
    syllabus_id = execute(
        """INSERT INTO syllabi (course_id, filename, filepath, raw_text)
           VALUES (?, ?, ?, ?)""",
        (course_id, original_name, filepath, raw_text),
    )

    logger.info(
        "Upload complete: course_id=%s syllabus_id=%s chars=%d",
        course_id, syllabus_id, len(raw_text),
    )

    return jsonify({
        "course_id":              course_id,
        "syllabus_id":            syllabus_id,
        "filename":               original_name,
        "extracted_text_preview": raw_text[:500] + ("..." if len(raw_text) > 500 else ""),
        "char_count":             len(raw_text),
        "message":                "File uploaded and text extracted successfully.",
    }), 201


# ── Retrieve syllabus text for a course ──────────────────────────────────────
@upload_bp.route("/api/courses/<int:course_id>/syllabus")
def api_get_syllabus(course_id):
    """GET /api/courses/<id>/syllabus — return raw extracted text."""
    row = query(
        "SELECT * FROM syllabi WHERE course_id = ? ORDER BY created_at DESC LIMIT 1",
        (course_id,),
        one=True,
    )
    if not row:
        return jsonify({"error": "No syllabus found for this course"}), 404
    return jsonify({
        "syllabus_id": row["id"],
        "filename":    row["filename"],
        "raw_text":    row["raw_text"],
        "created_at":  row["created_at"],
    })