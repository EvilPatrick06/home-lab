# Repo-root task runner. No npm workspace exists (each project installs
# independently); this is just a uniform entry point that fans out to each
# project's own commands. Usage: make lint | typecheck | test | build | audit | all
.PHONY: help install lint typecheck test build audit all

help:
	@echo "Targets: install lint typecheck test build audit all"
	@echo "  lint      -> dnd-app + dungeon-scholar (biome); bmo/pi (ruff); oracle-worker (no-op)"
	@echo "  typecheck -> dnd-app only (dungeon-scholar/oracle-worker have no standalone tsc; vite/wrangler transpile)"
	@echo "  test      -> dnd-app + dungeon-scholar + oracle-worker (npm) + bmo/pi (pytest)"
	@echo "  build     -> dnd-app + dungeon-scholar (npm) + oracle-worker (wrangler dry-run)"
	@echo "  audit     -> each project: npm run audit:ci"

install:
	cd dnd-app && npm ci
	cd dungeon-scholar && npm ci
	cd oracle-worker && npm ci

lint:
	cd dnd-app && npm run lint
	cd dungeon-scholar && npm run lint
	cd oracle-worker && npm run lint
	cd bmo/pi && ruff check .

# typecheck covers dnd-app only: dungeon-scholar has no tsconfig/tsc step (Vite
# transpiles; no standalone typecheck) and oracle-worker is validated by its
# wrangler dry-run under `build`. Revisit if either gains a tsconfig.
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
	cd dungeon-scholar && npm run audit:ci
	cd oracle-worker && npm run audit:ci

all: lint typecheck test build
