from typing import List, Union, Optional
from pydantic import AnyHttpUrl, validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "SGP V3 ERP"
    API_V1_STR: str = "/api/v1"
    
    SECRET_KEY: str = "DESARROLLO_SECRET_KEY_INSEGURA_SOLO_LOCAL"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8 
    
    # --- CORS DINÁMICO ---
    # Esto leerá la lista del .env
    BACKEND_CORS_ORIGINS: List[AnyHttpUrl] = []

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, (list, str)):
            return v
        raise ValueError(v)

    DATABASE_URL: str = "sqlite:///./local_dev.db"

    # Google Cloud
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None
    GOOGLE_CLOUD_BUCKET_NAME: Optional[str] = None

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore" # Ignora variables extra en el .env

settings = Settings()