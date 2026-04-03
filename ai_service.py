# ai_service.py — All AI calls to aipipe.org (OpenAI-compatible)
import os
import json
import logging
import requests
from config import Config

logger = logging.getLogger(__name__)


def _get_api_key() -> str:
    """Retrieve API key: env var → Colab secrets → raise."""
    key = os.environ.get("AIPIPE_API_KEY", "").strip()
    if key:
        return key
    # Colab / Jupyter environment
    try:
        from google.colab import userdata   # type: ignore
        key = userdata.get("AIPIPE_API_KEY")
        if key:
            return key
    except Exception:
        pass
    raise RuntimeError(
        "AIPIPE_API_KEY not found. "
        "Set it in your environment or Colab secrets."
    )


def _chat(messages: list[dict], temperature: float | None = None, max_tokens: int | None = None) -> str:
    """
    Send a chat completion request to aipipe.org and return the text response.
    Raises RuntimeError on HTTP / JSON errors so callers can surface them cleanly.
    """
    api_key    = _get_api_key()
    url        = f"{Config.AIPIPE_BASE_URL}/chat/completions"
    payload    = {
        "model":       Config.AIPIPE_MODEL,
        "messages":    messages,
        "max_tokens":  max_tokens or Config.AI_MAX_TOKENS,
        "temperature": temperature if temperature is not None else Config.AI_TEMPERATURE,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()
    except requests.exceptions.Timeout:
        raise RuntimeError("AI API timed out. Please try again.")
    except requests.exceptions.HTTPError as e:
        logger.error("AI HTTP error: %s — %s", e, resp.text[:300])
        raise RuntimeError(f"AI API error ({resp.status_code}): {resp.text[:200]}")
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        logger.error("Unexpected AI response: %s", e)
        raise RuntimeError("Unexpected response format from AI API.")


def _parse_json_response(raw: str) -> dict | list:
    """Strip markdown code fences then JSON-parse."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


# ═══════════════════════════════════════════════════════════════════════════════
# Public AI functions
# ═══════════════════════════════════════════════════════════════════════════════

def generate_modules(topic: str, syllabus_text: str = "") -> list[dict]:
    """
    Break a topic (or syllabus) into micro-learning modules.
    Returns: [{"title": ..., "description": ..., "subtopics": [...], "order_index": N}]
    """
    context = f"\n\nSyllabus / Portion:\n{syllabus_text[:3000]}" if syllabus_text else ""
    prompt = f"""You are an expert curriculum designer.
Break the following topic into 5-7 micro-learning modules.
Topic: {topic}{context}

Return ONLY a valid JSON array. No markdown, no explanation.
Each element must have:
  "title"       : short module name (max 6 words)
  "description" : 1-sentence summary
  "subtopics"   : array of 3-5 subtopic strings
  "order_index" : integer starting from 1

Example format:
[
  {{
    "title": "Introduction to Variables",
    "description": "Understand what variables are and how to use them.",
    "subtopics": ["Declaring variables", "Data types", "Naming conventions"],
    "order_index": 1
  }}
]"""

    raw = _chat([{"role": "user", "content": prompt}], temperature=0.6)
    modules = _parse_json_response(raw)
    if not isinstance(modules, list):
        raise RuntimeError("AI returned non-list module data.")
    return modules


def generate_notes(topic: str, module_title: str = "") -> str:
    """Generate comprehensive markdown notes for a topic / module."""
    focus = f" focusing on the module: **{module_title}**" if module_title else ""
    prompt = f"""You are an expert teacher writing micro-learning notes.
Write comprehensive, beginner-friendly notes on: **{topic}**{focus}

Requirements:
- Use clear Markdown headings (##, ###)
- Include bullet points, bold key terms, and code examples where relevant
- Cover: overview, core concepts, examples, common mistakes, summary
- Length: 400-600 words
- Tone: friendly, clear, structured"""

    return _chat([{"role": "user", "content": prompt}], temperature=0.5)


def generate_flashcards(topic: str, count: int = 10) -> list[dict]:
    """
    Generate flashcard Q&A pairs.
    Returns: [{"question": ..., "answer": ...}]
    """
    prompt = f"""Create exactly {count} flashcards for: **{topic}**

Return ONLY a valid JSON array. No markdown, no explanation.
Each element: {{"question": "...", "answer": "..."}}

Rules:
- Questions must be specific and testable
- Answers: 1-3 sentences, clear and accurate
- Cover different aspects of the topic
- No duplicate questions"""

    raw   = _chat([{"role": "user", "content": prompt}], temperature=0.7)
    cards = _parse_json_response(raw)
    if not isinstance(cards, list):
        raise RuntimeError("AI returned non-list flashcard data.")
    return cards[:count]


def generate_quiz(topic: str, quiz_type: str = "objective", count: int = 5) -> list[dict]:
    """
    Generate quiz questions (unique each call — high temperature).
    quiz_type: 'objective' → fill-in-the-blank  |  'subjective' → short answer

    Returns:
      objective:  [{"question": ..., "blank": ..., "answer": ..., "hint": ...}]
      subjective: [{"question": ..., "expected_points": [...], "sample_answer": ...}]
    """
    if quiz_type == "objective":
        prompt = f"""Create exactly {count} fill-in-the-blank questions for: **{topic}**

Return ONLY a valid JSON array. No markdown, no explanation.
Each element:
{{
  "question": "The ___ data structure uses LIFO ordering.",
  "blank": "stack",
  "answer": "stack",
  "hint": "Think of a pile of plates."
}}

Rules:
- The blank must be a single word or short phrase
- Include a helpful hint
- Cover different aspects of the topic
- No repeated answers"""

    else:  # subjective
        prompt = f"""Create exactly {count} short-answer questions for: **{topic}**

Return ONLY a valid JSON array. No markdown, no explanation.
Each element:
{{
  "question": "Explain the difference between a list and a tuple in Python.",
  "expected_points": ["Lists are mutable", "Tuples are immutable", "Tuples use parentheses"],
  "sample_answer": "Lists are mutable sequences ... tuples are immutable ..."
}}

Rules:
- Questions require 2-4 sentence answers
- Include 3-5 key expected points for evaluation
- Vary difficulty (easy, medium, hard)"""

    raw       = _chat([{"role": "user", "content": prompt}], temperature=0.9)
    questions = _parse_json_response(raw)
    if not isinstance(questions, list):
        raise RuntimeError("AI returned non-list quiz data.")
    return questions[:count]


def evaluate_quiz(topic: str, quiz_type: str, questions: list[dict], user_answers: list[str]) -> dict:
    """
    Evaluate user answers and return per-question feedback + overall score.
    Returns:
    {
      "results": [{"question": ..., "user_answer": ..., "correct": bool,
                   "explanation": ..., "score": float}],
      "total_score": float,        # 0-100
      "percentage": float,
      "feedback": str              # overall encouraging message
    }
    """
    qa_pairs = []
    for i, (q, ua) in enumerate(zip(questions, user_answers)):
        qa_pairs.append({
            "index":       i + 1,
            "question":    q.get("question", ""),
            "user_answer": ua,
            "correct_answer": q.get("answer", "") or q.get("sample_answer", ""),
            "expected_points": q.get("expected_points", []),
        })

    prompt = f"""You are a fair and encouraging teacher evaluating a {quiz_type} quiz on: **{topic}**

Quiz answers to evaluate:
{json.dumps(qa_pairs, indent=2)}

Return ONLY a valid JSON object. No markdown, no explanation.
Format:
{{
  "results": [
    {{
      "question":    "...",
      "user_answer": "...",
      "correct":     true or false,
      "score":       0.0 to 1.0,
      "explanation": "Brief explanation of the correct answer and where the user went right/wrong."
    }}
  ],
  "total_score": <sum of scores>,
  "max_score":   {len(questions)},
  "percentage":  <0-100 float>,
  "feedback":    "One encouraging sentence summarising performance."
}}

Scoring:
- objective: 1.0 = exact/near-exact, 0.5 = partially correct, 0.0 = wrong
- subjective: award partial credit based on expected_points covered"""

    raw    = _chat([{"role": "user", "content": prompt}], temperature=0.3)
    result = _parse_json_response(raw)
    return result


def generate_exercises(topic: str, count: int = 3) -> list[dict]:
    """
    Generate beginner-friendly kinesthetic exercises.
    Returns: [{"title": ..., "description": ..., "steps": [...], "expected_output": ...}]
    """
    prompt = f"""Create {count} beginner-friendly practical exercises for: **{topic}**

Return ONLY a valid JSON array. No markdown, no explanation.
Each element:
{{
  "title":           "Short exercise name",
  "description":     "What the learner will practise.",
  "steps":           ["Step 1 ...", "Step 2 ...", "Step 3 ..."],
  "expected_output": "What success looks like.",
  "difficulty":      "easy | medium | hard"
}}"""

    raw       = _chat([{"role": "user", "content": prompt}], temperature=0.7)
    exercises = _parse_json_response(raw)
    if not isinstance(exercises, list):
        raise RuntimeError("AI returned non-list exercise data.")
    return exercises[:count]


def generate_visual_tree(topic: str, modules: list[dict]) -> dict:
    """
    Generate a topic-hierarchy tree suitable for D3 rendering.
    Returns: {"name": topic, "children": [{"name": module, "children": [{subtopic nodes}]}]}
    """
    module_summary = [
        {"title": m["title"], "subtopics": m.get("subtopics", [])}
        for m in modules[:7]
    ]
    prompt = f"""Build a JSON topic tree for D3.js visualisation.
Topic: {topic}
Modules: {json.dumps(module_summary)}

Return ONLY a valid JSON object in D3 hierarchy format. No markdown.
{{
  "name": "{topic}",
  "children": [
    {{
      "name": "Module Title",
      "children": [
        {{"name": "Subtopic A"}},
        {{"name": "Subtopic B"}}
      ]
    }}
  ]
}}"""

    raw  = _chat([{"role": "user", "content": prompt}], temperature=0.4)
    tree = _parse_json_response(raw)
    return tree


def generate_writing_prompt(topic: str, module_title: str = "") -> dict:
    """
    Generate grey 'ghost text' for writing mode.
    Returns: {"prompt": ..., "ghost_text": ...}
    """
    focus = f" on the module '{module_title}'" if module_title else ""
    prompt_msg = f"""Generate a writing mode prompt for micro-learning{focus}.
Topic: {topic}

Return ONLY a valid JSON object. No markdown.
{{
  "prompt":     "A guiding question or title the learner will write about.",
  "ghost_text": "A 100-150 word model answer in first person that appears as grey placeholder text the learner types over."
}}"""

    raw = _chat([{"role": "user", "content": prompt_msg}], temperature=0.6)
    return _parse_json_response(raw)