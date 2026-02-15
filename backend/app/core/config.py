from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_name: str = "Personal Assistant AI"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://assistant:assistant@localhost:5432/assistant"
    database_url_sync: str = "postgresql://assistant:assistant@localhost:5432/assistant"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # JWT Auth
    jwt_secret_key: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # Microsoft OAuth
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_tenant_id: str = ""

    # Anthropic
    anthropic_api_key: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Encryption key for storing OAuth tokens
    encryption_key: str = ""

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


settings = Settings()
