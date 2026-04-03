# db.py — SQLite database initialisation and helper functions
import sqlite3
import json
from config import Config


def get_connection():
    """Return a connection with row_factory so rows act like dicts."""
    conn = sqlite3.connect(Config.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")   # better concurrency
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Create all tables if they don't exist yet."""
    conn = get_connection()
    cur = conn.cursor()

    # ── Courses ──────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS courses (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            description TEXT,
            category    TEXT,
            difficulty  TEXT    DEFAULT 'beginner',
            tags        TEXT    DEFAULT '[]',   -- JSON array
            created_at  TEXT    DEFAULT (datetime('now')),
            updated_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── Uploaded syllabi ──────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS syllabi (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
            filename    TEXT    NOT NULL,
            filepath    TEXT    NOT NULL,
            raw_text    TEXT,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── Generated modules (topic breakdown) ──────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS modules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
            title       TEXT    NOT NULL,
            description TEXT,
            order_index INTEGER DEFAULT 0,
            subtopics   TEXT    DEFAULT '[]',   -- JSON array of strings
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── Generated notes ───────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
            module_id   INTEGER REFERENCES modules(id) ON DELETE SET NULL,
            content     TEXT    NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── Flashcards ────────────────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS flashcards (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
            module_id   INTEGER REFERENCES modules(id) ON DELETE SET NULL,
            question    TEXT    NOT NULL,
            answer      TEXT    NOT NULL,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    # ── Quiz sessions (one row per attempt) ──────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quiz_sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id   INTEGER REFERENCES courses(id) ON DELETE CASCADE,
            quiz_type   TEXT    NOT NULL,   -- 'objective' | 'subjective'
            questions   TEXT    NOT NULL,   -- JSON
            answers     TEXT,               -- JSON (user answers)
            evaluation  TEXT,               -- JSON (AI evaluation)
            score       REAL,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    conn.commit()
    conn.close()
    print("[db] Tables ready.")


# ── Seed helper ───────────────────────────────────────────────────────────────
def seed_courses():
    """Insert demo courses so the home page is not empty on first run."""
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM courses")
    if cur.fetchone()[0] > 0:
        conn.close()
        return   # already seeded

    demo = [
        {
            "title": "Python Programming",
            "description": "Learn Python from variables to advanced OOP, covering data structures, functions, and real-world projects.",
            "category": "Programming",
            "difficulty": "beginner",
            "tags": json.dumps(["python", "programming", "beginner"]),
        },
        {
            "title": "Machine Learning Fundamentals",
            "description": "Understand supervised and unsupervised learning, model evaluation, and build your first ML pipelines.",
            "category": "AI / ML",
            "difficulty": "intermediate",
            "tags": json.dumps(["ml", "ai", "data science"]),
        },
        {
            "title": "Web Development with Flask",
            "description": "Build full-stack web applications using Flask, Jinja2 templates, SQLite, and REST APIs.",
            "category": "Web",
            "difficulty": "intermediate",
            "tags": json.dumps(["flask", "python", "web"]),
        },
        {
            "title": "Data Structures & Algorithms",
            "description": "Master arrays, trees, graphs, sorting, and dynamic programming with step-by-step intuition.",
            "category": "Computer Science",
            "difficulty": "intermediate",
            "tags": json.dumps(["dsa", "algorithms", "cs"]),
        },
        {
            "title": "Deep Learning with PyTorch",
            "description": "Build neural networks, CNNs, RNNs, and transformers using PyTorch from scratch.",
            "category": "AI / ML",
            "difficulty": "advanced",
            "tags": json.dumps(["deep learning", "pytorch", "neural networks"]),
        },
        {
            "title": "SQL & Database Design",
            "description": "Design normalised schemas, write complex queries, and optimise database performance.",
            "category": "Databases",
            "difficulty": "beginner",
            "tags": json.dumps(["sql", "database", "sqlite"]),
        },
    ]

    for c in demo:
        cur.execute(
            """INSERT INTO courses (title, description, category, difficulty, tags)
               VALUES (:title, :description, :category, :difficulty, :tags)""",
            c,
        )

    conn.commit()
    conn.close()
    print(f"[db] Seeded {len(demo)} demo courses.")


# ── Generic CRUD helpers ──────────────────────────────────────────────────────
def query(sql: str, params=(), one=False):
    conn = get_connection()
    cur  = conn.execute(sql, params)
    rows = cur.fetchone() if one else cur.fetchall()
    conn.close()
    return dict(rows) if (one and rows) else ([dict(r) for r in rows] if rows else (None if one else []))


def execute(sql: str, params=()):
    conn = get_connection()
    cur  = conn.execute(sql, params)
    conn.commit()
    last_id = cur.lastrowid
    conn.close()
    return last_id