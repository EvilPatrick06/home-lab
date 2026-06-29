# Repo-root task runner. No npm workspace exists (each project installs
# independently); this is just a uniform entry point that fans out to each
# project's own commands. Usage: make lint | typecheck | test | build | audit | all
.PHONY: help install hooks lint typecheck test build audit all

help:
	@echo "Targets: install hooks lint typecheck test build audit all"
	@echo "  lint      -> dnd-app + dungeon-scholar (biome); bmo/pi (ruff); oracle-worker (no-op)"
	@echo "  typecheck -> dnd-app only (dungeon-scholar/oracle-worker have no standalone tsc; vite/wrangler transpile)"
	@echo "  test      -> dnd-app + dungeon-scholar + oracle-worker (npm) + bmo/pi (pytest)"
	@echo "  build     -> dnd-app + dungeon-scholar (npm) + oracle-worker (wrangler dry-run)"
	@echo "  audit     -> each project: npm run audit:ci"

# hooks: wire the repo-root Husky pre-commit hook for ALL projects, independent
# of which subproject you bootstrap. Pure-git (no npm/husky needed): points
# core.hooksPath at .husky so .husky/pre-commit runs (Husky v9 style). `make
# install` runs this too, so any project's setup wires the repo-wide gitleaks
# secret scan + per-project pre-flight, not just `npm install` inside dnd-app/.
hooks:
	@git config core.hooksPath .husky && echo "core.hooksPath -> .husky (pre-commit active for all projects)"

install: hooks
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
