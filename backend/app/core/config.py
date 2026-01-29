from typing import List, Union
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "SGP V3 ERP"
    API_V1_STR: str = "/api/v1"
    
    # Clave por defecto para DEV (En Prod se sobreescribe con .env)
    SECRET_KEY: str = "DESARROLLO_SECRET_KEY_INSEGURA_SOLO_LOCAL"
    
    # --- AGREGA ESTA LÍNEA ---
    ALGORITHM: str = "HS256"
    # -------------------------
    
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 días
    
    # Cors origins: Por defecto permitimos localhost para Vite
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    # Base de Datos: Por defecto SQLite local
    DATABASE_URL: str = "sqlite:///./sgp_v3.db"

    class Config:
        case_sensitive = True
        env_file = ".env"

settings = Settings()