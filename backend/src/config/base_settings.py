from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

load_dotenv()


class EnvBaseSettings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")
