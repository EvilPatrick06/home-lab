"""
SQLite Long-Term Session Memory for D&D Campaigns.

Provides persistent storage for campaign sessions, NPCs, locations,
plot threads, player notes, and item inventories. Designed to feed
context back into the AI DM system.
"""

import sqlite3
import os
import json
import datetime
from typing import Optional


DB_PATH = os.path.expanduser("~/bmo/data/campaign_memory.db")


class CampaignMemory:
    """Persistent D&D campaign memory backed by SQLite."""

    def __init__(self, db_path: str = DB_PATH) -> None:
        self.db_path = db_path
        self._init_db()

    # ------------------------------------------------------------------
    # Database setup
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        """Create the database directory and tables if they don't exist."""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign    TEXT    NOT NULL,
                    started_at  TEXT    NOT NULL,
                    ended_at    TEXT,
                    summary     TEXT
                );

                CREATE TABLE IF NOT EXISTS npcs (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign    TEXT    NOT NULL,
                    name        TEXT    NOT NULL,
                    description TEXT,
                    location    TEXT,
                    attitude    TEXT    DEFAULT 'neutral',
                    voice       TEXT,
                    notes       TEXT,
                    created_at  TEXT    NOT NULL,
                    updated_at  TEXT    NOT NULL,
                    UNIQUE(campaign, name)
                );

                CREATE TABLE IF NOT EXISTS locations (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign    TEXT    NOT NULL,
                    name        TEXT    NOT NULL,
                    description TEXT,
                    discovered  INTEGER DEFAULT 1,
                    created_at  TEXT    NOT NULL,
                    UNIQUE(campaign, name)
                );

                CREATE TABLE IF NOT EXISTS plot_threads (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign    TEXT    NOT NULL,
                    title       TEXT    NOT NULL,
                    description TEXT,
                    status      TEXT    DEFAULT 'active',
                    created_at  TEXT    NOT NULL,
                    updated_at  TEXT    NOT NULL,
                    UNIQUE(campaign, title)
                );

                CREATE TABLE IF NOT EXISTS player_notes (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign    TEXT    NOT NULL,
                    content     TEXT    NOT NULL,
                    category    TEXT    DEFAULT 'general',
                    created_at  TEXT    NOT NULL
                );

                CREATE TABLE IF NOT EXISTS items (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign    TEXT    NOT NULL,
                    character   TEXT    NOT NULL,
                    item        TEXT    NOT NULL,
                    quantity    INTEGER DEFAULT 1,
                    created_at  TEXT    NOT NULL,
                    updated_at  TEXT    NOT NULL,
                    UNIQUE(campaign, character, item)
                );

                CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON sessions(campaign);
                CREATE INDEX IF NOT EXISTS idx_npcs_campaign ON npcs(campaign);
                CREATE INDEX IF NOT EXISTS idx_locations_campaign ON locations(campaign);
                CREATE INDEX IF NOT EXISTS idx_plot_threads_campaign ON plot_threads(campaign);
                CREATE INDEX IF NOT EXISTS idx_player_notes_campaign ON player_notes(campaign);
                CREATE INDEX IF NOT EXISTS idx_items_campaign_char ON items(campaign, character);
            """)

    def _connect(self) -> sqlite3.Connection:
        """Open a connection with row-factory support."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _now() -> str:
        """Return the current UTC timestamp as an ISO-8601 string."""
        return datetime.datetime.utcnow().isoformat()

    @staticmethod
    def _row_to_dict(row: Optional[sqlite3.Row]) -> Optional[dict]:
        """Convert a sqlite3.Row to a plain dict, or None."""
        if row is None:
            return None
        return dict(row)

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def start_session(self, campaign_name: str) -> int:
        """Start a new session for the given campaign.

        Returns the new session's id.
        """
        now = self._now()
        with self._connect() as conn:
            cursor = conn.execute(
                "INSERT INTO sessions (campaign, started_at) VALUES (?, ?)",
                (campaign_name, now),
            )
            return cursor.lastrowid  # type: ignore[return-value]

    def end_session(self, session_id: int, summary: str) -> None:
        """End a session, recording the end time and a summary."""
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET ended_at = ?, summary = ? WHERE id = ?",
                (now, summary, session_id),
            )

    def get_session(self, session_id: int) -> Optional[dict]:
        """Retrieve a single session by id."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
            return self._row_to_dict(row)

    def get_recent_sessions(
        self, campaign_name: str, limit: int = 5
    ) -> list[dict]:
        """Return the most recent sessions for a campaign, newest first."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM sessions WHERE campaign = ? ORDER BY id DESC LIMIT ?",
                (campaign_name, limit),
            ).fetchall()
            return [dict(r) for r in rows]

    def get_session_summary(self, session_id: int) -> str:
        """Return just the summary text for a session, or an empty string."""
        session = self.get_session(session_id)
        if session is None:
            return ""
        return session.get("summary") or ""

    # ------------------------------------------------------------------
    # NPC tracking
    # ------------------------------------------------------------------

    def add_npc(
        self,
        campaign: str,
        name: str,
        description: str,
        location: str,
        attitude: str,
        voice: Optional[str] = None,
    ) -> None:
        """Add or replace an NPC record."""
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO npcs (campaign, name, description, location, attitude, voice, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(campaign, name) DO UPDATE SET
                    description = excluded.description,
                    location    = excluded.location,
                    attitude    = excluded.attitude,
                    voice       = excluded.voice,
                    updated_at  = excluded.updated_at
                """,
                (campaign, name, description, location, attitude, voice, now, now),
            )

    def update_npc(self, campaign: str, name: str, **updates: str) -> None:
        """Update specific fields of an existing NPC.

        Allowed keyword arguments: description, location, attitude, voice, notes.
        """
        allowed = {"description", "location", "attitude", "voice", "notes"}
        filtered = {k: v for k, v in updates.items() if k in allowed}
        if not filtered:
            return

        now = self._now()
        filtered["updated_at"] = now

        set_clause = ", ".join(f"{col} = ?" for col in filtered)
        values = list(filtered.values()) + [campaign, name]

        with self._connect() as conn:
            conn.execute(
                f"UPDATE npcs SET {set_clause} WHERE campaign = ? AND name = ?",
                values,
            )

    def get_npc(self, campaign: str, name: str) -> Optional[dict]:
        """Look up a single NPC by campaign and name."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM npcs WHERE campaign = ? AND name = ?",
                (campaign, name),
            ).fetchone()
            return self._row_to_dict(row)

    def list_npcs(self, campaign: str) -> list[dict]:
        """List all NPCs for a campaign, ordered by name."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM npcs WHERE campaign = ? ORDER BY name",
                (campaign,),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Location tracking
    # ------------------------------------------------------------------

    def add_location(
        self,
        campaign: str,
        name: str,
        description: str,
        discovered: bool = True,
    ) -> None:
        """Add or replace a location record."""
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO locations (campaign, name, description, discovered, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(campaign, name) DO UPDATE SET
                    description = excluded.description,
                    discovered  = excluded.discovered
                """,
                (campaign, name, description, int(discovered), now),
            )

    def list_locations(self, campaign: str) -> list[dict]:
        """List all locations for a campaign, ordered by name."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM locations WHERE campaign = ? ORDER BY name",
                (campaign,),
            ).fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d["discovered"] = bool(d["discovered"])
                results.append(d)
            return results

    # ------------------------------------------------------------------
    # Plot threads
    # ------------------------------------------------------------------

    def add_plot_thread(
        self,
        campaign: str,
        title: str,
        description: str,
        status: str = "active",
    ) -> None:
        """Add or replace a plot thread."""
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO plot_threads (campaign, title, description, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(campaign, title) DO UPDATE SET
                    description = excluded.description,
                    status      = excluded.status,
                    updated_at  = excluded.updated_at
                """,
                (campaign, title, description, status, now, now),
            )

    def update_plot_thread(self, campaign: str, title: str, status: str) -> None:
        """Update the status of a plot thread (e.g. 'active', 'resolved', 'abandoned')."""
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                "UPDATE plot_threads SET status = ?, updated_at = ? WHERE campaign = ? AND title = ?",
                (status, now, campaign, title),
            )

    def list_plot_threads(
        self, campaign: str, status: Optional[str] = None
    ) -> list[dict]:
        """List plot threads for a campaign, optionally filtered by status."""
        with self._connect() as conn:
            if status is not None:
                rows = conn.execute(
                    "SELECT * FROM plot_threads WHERE campaign = ? AND status = ? ORDER BY created_at",
                    (campaign, status),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM plot_threads WHERE campaign = ? ORDER BY created_at",
                    (campaign,),
                ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Player notes (voice-added)
    # ------------------------------------------------------------------

    def add_note(
        self, campaign: str, content: str, category: str = "general"
    ) -> None:
        """Add a free-form note to the campaign."""
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO player_notes (campaign, content, category, created_at) VALUES (?, ?, ?, ?)",
                (campaign, content, category, now),
            )

    def search_notes(self, campaign: str, query: str) -> list[dict]:
        """Search notes by substring match (case-insensitive)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM player_notes WHERE campaign = ? AND content LIKE ? ORDER BY created_at DESC",
                (campaign, f"%{query}%"),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Item / loot tracking
    # ------------------------------------------------------------------

    def add_item(
        self, campaign: str, character: str, item: str, quantity: int = 1
    ) -> None:
        """Add item(s) to a character's inventory. Stacks with existing quantity."""
        now = self._now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO items (campaign, character, item, quantity, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(campaign, character, item) DO UPDATE SET
                    quantity   = items.quantity + excluded.quantity,
                    updated_at = excluded.updated_at
                """,
                (campaign, character, item, quantity, now, now),
            )

    def remove_item(
        self, campaign: str, character: str, item: str, quantity: int = 1
    ) -> None:
        """Remove item(s) from a character's inventory.

        If quantity drops to 0 or below, the row is deleted.
        """
        now = self._now()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT quantity FROM items WHERE campaign = ? AND character = ? AND item = ?",
                (campaign, character, item),
            ).fetchone()

            if row is None:
                return

            new_qty = row["quantity"] - quantity
            if new_qty <= 0:
                conn.execute(
                    "DELETE FROM items WHERE campaign = ? AND character = ? AND item = ?",
                    (campaign, character, item),
                )
            else:
                conn.execute(
                    "UPDATE items SET quantity = ?, updated_at = ? WHERE campaign = ? AND character = ? AND item = ?",
                    (new_qty, now, campaign, character, item),
                )

    def get_inventory(self, campaign: str, character: str) -> list[dict]:
        """Return all items held by a character, ordered by item name."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM items WHERE campaign = ? AND character = ? ORDER BY item",
                (campaign, character),
            ).fetchall()
            return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Context generation for the AI DM
    # ------------------------------------------------------------------

    def build_dm_context(self, campaign: str) -> str:
        """Build a context string for the DM prompt.

        Aggregates recent session summaries, known NPCs, discovered locations,
        and active plot threads into a single text block suitable for inclusion
        in an LLM system prompt.
        """
        sections: list[str] = []

        # --- Recent sessions ---
        sessions = self.get_recent_sessions(campaign, limit=5)
        if sessions:
            session_lines: list[str] = []
            for s in reversed(sessions):  # oldest first
                summary = s.get("summary") or "(no summary)"
                date = s.get("started_at", "unknown date")[:10]
                session_lines.append(f"  - Session {s['id']} ({date}): {summary}")
            sections.append("RECENT SESSIONS:\n" + "\n".join(session_lines))

        # --- NPCs ---
        npcs = self.list_npcs(campaign)
        if npcs:
            npc_lines: list[str] = []
            for npc in npcs:
                parts = [npc["name"]]
                if npc.get("location"):
                    parts.append(f"at {npc['location']}")
                if npc.get("attitude"):
                    parts.append(f"({npc['attitude']})")
                desc = npc.get("description") or ""
                if desc:
                    parts.append(f"- {desc}")
                npc_lines.append("  - " + " ".join(parts))
            sections.append("KNOWN NPCs:\n" + "\n".join(npc_lines))

        # --- Locations ---
        locations = self.list_locations(campaign)
        discovered = [loc for loc in locations if loc.get("discovered")]
        if discovered:
            loc_lines: list[str] = []
            for loc in discovered:
                desc = loc.get("description") or ""
                line = f"  - {loc['name']}"
                if desc:
                    line += f": {desc}"
                loc_lines.append(line)
            sections.append("DISCOVERED LOCATIONS:\n" + "\n".join(loc_lines))

        # --- Active plot threads ---
        threads = self.list_plot_threads(campaign, status="active")
        if threads:
            thread_lines: list[str] = []
            for t in threads:
                desc = t.get("description") or ""
                line = f"  - {t['title']}"
                if desc:
                    line += f": {desc}"
                thread_lines.append(line)
            sections.append("ACTIVE PLOT THREADS:\n" + "\n".join(thread_lines))

        if not sections:
            return f"No campaign memory recorded yet for '{campaign}'."

        header = f"=== Campaign Memory: {campaign} ===\n"
        return header + "\n\n".join(sections)
