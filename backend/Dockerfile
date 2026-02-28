FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency installation
RUN pip install uv --no-cache-dir

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies — not frozen so uv resolves from pyproject.toml
# (psycopg2 source removed in favour of psycopg2-binary wheel)
RUN uv sync --no-dev

# Copy source code
COPY . .

EXPOSE 8082

CMD ["uv", "run", "python", "app.py"]
