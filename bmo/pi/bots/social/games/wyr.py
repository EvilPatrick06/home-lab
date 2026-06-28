"""Would-You-Rather game UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

import discord


class WYRView(discord.ui.View):
    def __init__(self, option_a: str, option_b: str) -> None:
        super().__init__(timeout=30)
        self.option_a = option_a
        self.option_b = option_b
        self.votes_a: set[int] = set()
        self.votes_b: set[int] = set()

    @discord.ui.button(label="Option A", style=discord.ButtonStyle.primary, row=0)
    async def vote_a(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        uid = interaction.user.id
        self.votes_b.discard(uid)
        self.votes_a.add(uid)
        total = len(self.votes_a) + len(self.votes_b)
        pct_a = int(len(self.votes_a) / total * 100) if total else 0
        pct_b = int(len(self.votes_b) / total * 100) if total else 0
        await interaction.response.send_message(
            f"You chose **A**! A={pct_a}% ({len(self.votes_a)}) vs B={pct_b}% ({len(self.votes_b)})",
            ephemeral=True,
        )

    @discord.ui.button(label="Option B", style=discord.ButtonStyle.danger, row=0)
    async def vote_b(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        uid = interaction.user.id
        self.votes_a.discard(uid)
        self.votes_b.add(uid)
        total = len(self.votes_a) + len(self.votes_b)
        pct_a = int(len(self.votes_a) / total * 100) if total else 0
        pct_b = int(len(self.votes_b) / total * 100) if total else 0
        await interaction.response.send_message(
            f"You chose **B**! A={pct_a}% ({len(self.votes_a)}) vs B={pct_b}% ({len(self.votes_b)})",
            ephemeral=True,
        )
