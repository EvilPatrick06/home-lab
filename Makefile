# Repo-root task runner. No npm workspace exists (each project installs
# independently); this is just a uniform entry point that fans out to each
# project's own commands. Usage: make lint | typecheck | test | build | audit | all
.PHONY: help install lint typecheck test build audit all

help:
	@echo "Targets: install lint typecheck test build audit all"
	@echo "Fans out to dnd-app + dungeon-scholar + oracle-worker (npm) and bmo/pi (pytest)."

install:
	cd dnd-app && npm ci
	cd dungeon-scholar && npm ci
	cd oracle-worker && npm ci

lint:
	cd dnd-app && npm run lint

typecheck:
	cd dnd-app && npx tsc --noEmit -p tsconfig.web.json

test:
	cd dnd-app && npm test
	cd dungeon-scholar && npm test
	cd oracle-worker && npm test
	cd bmo/pi && python -m pytest -q

build:
	cd dnd-app && npm run build
	cd dungeon-scholar && npm run build
	cd oracle-worker && npm run check

audit:
	cd dnd-app && npm run audit:ci
	cd dungeon-scholar && npm audit --omit=dev --audit-level=moderate
	cd oracle-worker && npm audit --audit-level=high

all: lint typecheck test build
