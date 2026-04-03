# Smart AI Micro-Learning Assistant

Full-stack Flask application with AI-powered micro-learning:
modules, notes, flashcards, adaptive quizzes, audio lessons,
mind maps, writing mode, and kinesthetic exercises.

---

## Folder Structure
```
smart-learning/
├── app.py                  ← Flask entry point
├── config.py               ← All configuration
├── db.py                   ← SQLite schema + helpers
├── ai_service.py           ← All AI calls (aipipe.org)
├── requirements.txt
├── .env.example
├── README.md
│
├── routes/
│   ├── __init__.py
│   ├── courses.py          ← GET/POST /api/courses
│   ├── upload.py           ← POST /api/upload
│   ├── generate.py         ← notes, flashcards, exercises, visual, TTS
│   └── quiz.py             ← generate-quiz, evaluate
│
├── templates/
│   ├── base.html           ← Navbar, loader, toast, upload modal
│   ├── index.html          ← Home: search, filters, course grid
│   └── course.html         ← Course hub: all 7 learning tabs
│
├── static/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── api.js          ← Fetch wrapper
│       ├── main.js         ← Home page + upload modal logic
│       ├── course.js       ← Notes, audio, writing, flashcards, exercises
│       ├── quiz.js         ← Full quiz engine
│       └── visual.js       ← D3.js mind map
│
└── uploads/                ← Created automatically on first run
```

---

## Prerequisites

| Tool    | Version  |
|---------|----------|
| Python  | 3.10+    |
| pip     | latest   |
| Browser | Chrome / Firefox / Edge (modern) |

---

## Setup — Step by Step

### 1 · Clone / create project folder
```bash
mkdir smart-learning && cd smart-learning
# paste all files from the 5 modules here
```

### 2 · Create and activate a virtual environment
```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3 · Install dependencies
```bash
pip install -r requirements.txt
```

> **PDF extraction**: PyMuPDF (`fitz`) is tried first; `pdfminer.six` is the
> fallback. Both are in requirements.txt.

> **Audio (TTS)**: `gtts` sends text to Google TTS and returns an MP3.
> If unavailable the app falls back to the browser's Web Speech API silently.

### 4 · Set your API key
```bash
# Copy the example file
cp .env.example .env
```

Open `.env` and set:
```
AIPIPE_API_KEY=your_key_here
SECRET_KEY=any_random_string
DEBUG=true
```

Get your key from **[aipipe.org](https://aipipe.org)**.

> **Google Colab users**: store the key in Colab Secrets as `AIPIPE_API_KEY`.
> `ai_service.py` reads it via `google.colab.userdata` automatically.

### 5 · Run the application
```bash
python app.py
```

You should see:
```
[db] Tables ready.
[db] Seeded 6 demo courses.
[app] App created — debug=True
 * Running on http://0.0.0.0:5000
```

Open **http://localhost:5000** in your browser.

---

## Using the App

### Browse & Search
- Home page loads 6 seed courses instantly.
- Type in the search bar — results filter live (debounced 320 ms).
- Use category chips and difficulty buttons to narrow results.

### Upload Your Own Syllabus
- Click **Upload** in the navbar or "Course not found?" below the search bar.
- Drag and drop or browse for a **PDF**, **TXT**, or **MD** file (max 16 MB).
- Fill in optional course name / category / difficulty.
- Click **Upload & Generate Course** — AI creates modules automatically and
  redirects you to the new course page.

### Course Learning Hub (7 tabs)

| Tab | What AI does |
|-----|-------------|
| **Reading** | Generates structured markdown notes with headings, code blocks, examples |
| **Visual** | Builds a D3 mind map — scroll to zoom, drag to pan, click nodes to expand |
| **Audio** | Converts notes to MP3 via gTTS; falls back to Web Speech API |
| **Writing** | Generates a prompt + ghost text you type over to reinforce learning |
| **Flashcards** | Generates 10 Q&A cards with flip animation and dot navigation |
| **Quiz** | Pick objective (fill-in-blank) or subjective (short answer); AI evaluates every answer with an explanation |
| **Practice** | Generates 3 beginner-friendly exercises with steps and expected outcome |

### Selecting Modules
- Click **Generate Learning Plan** on the course hero to let AI break the
  topic into 5–7 micro-modules.
- Click any module in the left sidebar — all tabs regenerate for that module.

### Quiz Flow
1. Choose **Fill in the Blanks** or **Short Answer**.
2. Pick question count (3 / 5 / 7 / 10).
3. Click **Start Quiz** — fresh AI questions every time.
4. Answer each question; use **Show Hint** for fill-in-the-blank.
5. Submit → AI evaluates and shows score, grade, and per-question explanation.
6. Click **New Questions** for a fresh attempt with no repeated questions.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/courses` | List / search courses (`?q=&category=&difficulty=`) |
| POST | `/api/courses` | Create course |
| GET | `/api/courses/<id>` | Single course with modules |
| GET | `/api/courses/<id>/modules` | Ordered module list |
| GET | `/api/categories` | Distinct category list |
| POST | `/api/upload` | Upload PDF/TXT syllabus |
| GET | `/api/courses/<id>/syllabus` | Raw extracted text |
| POST | `/api/courses/<id>/generate-modules` | AI module breakdown |
| POST | `/api/courses/<id>/generate-notes` | AI notes (markdown) |
| GET | `/api/courses/<id>/notes` | Latest notes |
| POST | `/api/courses/<id>/generate-flashcards` | AI flashcards |
| GET | `/api/courses/<id>/flashcards` | Saved flashcards |
| POST | `/api/courses/<id>/generate-exercises` | AI exercises |
| POST | `/api/courses/<id>/generate-visual` | D3 topic tree |
| POST | `/api/courses/<id>/generate-writing` | Writing prompt + ghost text |
| POST | `/api/courses/<id>/tts` | Text → MP3 audio |
| POST | `/api/courses/<id>/generate-quiz` | Fresh quiz session |
| POST | `/api/quiz/<session_id>/evaluate` | AI evaluation |
| GET | `/api/quiz/<session_id>` | Session result |
| GET | `/api/courses/<id>/quiz-history` | Last 10 attempts |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `AIPIPE_API_KEY not found` | Set key in `.env` or Colab Secrets |
| PDF text extraction empty | File is scanned — convert to text first |
| `gtts` not installed | `pip install gtts` — app falls back to browser TTS |
| `fitz` not found | `pip install PyMuPDF` |
| Port 5000 in use | `python app.py` → edit `port=5001` in `app.py` |
| CORS errors in dev | Already handled — Flask serves all static files |
| AI timeout | aipipe.org has 60 s timeout; retry or reduce question count |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AIPIPE_API_KEY` | **Yes** | — | aipipe.org API key |
| `SECRET_KEY` | No | `dev-secret-key` | Flask session secret |
| `DEBUG` | No | `true` | Flask debug mode |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10 · Flask 3 |
| Database | SQLite (WAL mode) |
| AI | aipipe.org (OpenAI-compatible) · gpt-4o-mini |
| PDF extract | PyMuPDF · pdfminer.six |
| TTS | gTTS · Web Speech API (fallback) |
| Frontend | Vanilla JS · D3.js v7 · Marked.js · jsPDF |
| Fonts / Icons | Inter · Font Awesome 6 |