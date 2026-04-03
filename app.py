# app.py — Flask application entry point
import os
import logging
from flask import Flask
from config import Config
from db import init_db, seed_courses

# Logging
logging.basicConfig(
    level=logging.DEBUG if Config.DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    app = Flask(__name__, template_folder="templates", static_folder="static")
    app.config.from_object(Config)

    # Ensure upload directory exists
    os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

    # Initialise DB
    with app.app_context():
        init_db()
        seed_courses()

    # Register blueprints
    from routes.courses  import courses_bp
    from routes.upload   import upload_bp
    from routes.generate import generate_bp
    from routes.quiz     import quiz_bp

    app.register_blueprint(courses_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(generate_bp)
    app.register_blueprint(quiz_bp)

    # Global error handlers
    from flask import jsonify

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        logger.exception("Unhandled exception")
        return jsonify({"error": "Internal server error"}), 500

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "File too large (max 16 MB)"}), 413

    logger.info("App created — debug=%s", Config.DEBUG)
    return app


if __name__ == "__main__":
    application = create_app()
    application.run(host="0.0.0.0", port=5000, debug=Config.DEBUG)