.PHONY: up down logs backend-check backend-fix

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f api worker

# Tests need the compose database (`make up`); they create and use their own layerline_test DB.
backend-check:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest -q

backend-fix:
	cd backend && uv run ruff check --fix . && uv run ruff format .
