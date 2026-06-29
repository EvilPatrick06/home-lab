"""Would-You-Rather game UI — Components V2 (live results)."""

import discord


class WYRButton(discord.ui.Button):
    def __init__(self, which: str, label: str, style: discord.ButtonStyle) -> None:
        super().__init__(label=label, style=style)
        self.which = which

    async def callback(self, interaction: discord.Interaction) -> None:
        view: "WYRView" = self.view  # type: ignore[assignment]
        uid = interaction.user.id
        if self.which == "A":
            view.votes_b.discard(uid); view.votes_a.add(uid)
        else:
            view.votes_a.discard(uid); view.votes_b.add(uid)
        view.refresh()
        try:
            await interaction.response.edit_message(view=view)
        except discord.HTTPException:
            await interaction.response.send_message(f"You chose **{self.which}**!", ephemeral=True)


class WYRView(discord.ui.LayoutView):
    def __init__(self, option_a: str, option_b: str) -> None:
        super().__init__(timeout=30)
        self.option_a = option_a
        self.option_b = option_b
        self.votes_a: set[int] = set()
        self.votes_b: set[int] = set()
        self.closed = False
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0xFF6B6B))
        self.add_item(self._container)
        self.add_item(discord.ui.ActionRow(
            WYRButton("A", "🅰️ Option A", discord.ButtonStyle.primary),
            WYRButton("B", "🅱️ Option B", discord.ButtonStyle.danger)))

    def _content(self) -> str:
        total = len(self.votes_a) + len(self.votes_b)
        pa = int(len(self.votes_a) / total * 100) if total else 0
        pb = int(len(self.votes_b) / total * 100) if total else 0
        head = "## 🤔 Would You Rather…\n"
        body = (f"🅰️ **{self.option_a}** — {pa}% ({len(self.votes_a)})\n"
                f"🅱️ **{self.option_b}** — {pb}% ({len(self.votes_b)})")
        foot = "\n\n*Final results.*" if self.closed else "\n\n*Vote below — results update live (30s).*"
        return head + body + foot

    def refresh(self) -> None:
        self._text.content = self._content()

    def close(self) -> None:
        self.closed = True
        self.refresh()
        self._container.accent_colour = discord.Colour(0x00FF88)
        for item in self.children:
            if isinstance(item, discord.ui.ActionRow):
                for btn in item.children:
                    btn.disabled = True
