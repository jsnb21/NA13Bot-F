import os
from flask import Flask
from config import Config
from extensions import db, migrate
from blueprints.super_admin.routes import bp as super_admin_bp
from blueprints.resto_admin.routes import bp as resto_admin_bp
from blueprints.client_api.routes import bp as client_api_bp


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    app.register_blueprint(super_admin_bp, url_prefix="/super-admin")
    app.register_blueprint(resto_admin_bp, url_prefix="/resto-admin")
    app.register_blueprint(client_api_bp, url_prefix="/client-api")

    @app.route("/health", methods=["GET"])
    def health():
        return {"status": "ok"}

    return app


if __name__ == "__main__":
    application = create_app()
    port = int(os.getenv("PORT", 5000))
    application.run(host="0.0.0.0", port=port)
