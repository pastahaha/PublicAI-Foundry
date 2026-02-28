import logging
import sys
import asyncio
import selectors

from hypercorn.asyncio import serve
from hypercorn.config import Config

from src.main import app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
    force=True,
)

logging.getLogger("src").setLevel(logging.INFO)


if __name__ == "__main__":
    config = Config()
    config.bind = ["0.0.0.0:8082"]
    config.use_reloader = False

    # psycopg requires SelectorEventLoop on Windows (ProactorEventLoop is not supported)
    selector = selectors.SelectSelector()
    loop = asyncio.SelectorEventLoop(selector)
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(serve(app, config=config))
    finally:
        loop.close()
