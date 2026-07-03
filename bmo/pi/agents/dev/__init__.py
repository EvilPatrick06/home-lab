"""Dev / ops agent family.

Groups the routable dev/ops agents (code, deploy, docs, design, learning, plan,
research, review, security, testing, cleanup, monitoring), previously flat in
the `agents/` namespace. NOTE: this is `agents.dev` (an agent family), distinct
from the top-level `dev/` folder. Routing/registry/base infra stays at the
`agents/` top level; `_registry.py` references these via `agents.dev.<module>`.
"""
