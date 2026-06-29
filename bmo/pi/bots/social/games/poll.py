"""Poll UI — Components V2 (live-updating results)."""

import discord

_BAR_FULL = "▰"
_BAR_EMPTY = "▱"
_COLORS = [discord.ButtonStyle.primary, discord.ButtonStyle.success,
           discord.ButtonStyle.danger, discord.ButtonStyle.secondary]


class PollButton(discord.ui.Button):
    def __init__(self, index: int, label: str) -> None:
        super().__init__(label=label, style=_COLORS[index % len(_COLORS)])
        self.index = index

    async def callback(self, interaction: discord.Interaction) -> None:
        view: "PollView" = self.view  # type: ignore[assignment]
        uid = interaction.user.id
        prev = view.user_votes.get(uid)
        if prev is not None:
            view.votes[prev].discard(uid)
        view.votes[self.index].add(uid)
        view.user_votes[uid] = self.index
        view.refresh()
        try:
            await interaction.response.edit_message(view=view)
        except discord.HTTPException:
            await interaction.response.send_message(
                f"You voted for **{view.options[self.index]}**!", ephemeral=True)


class PollView(discord.ui.LayoutView):
    def __init__(self, question: str, options: list[str]) -> None:
        super().__init__(timeout=300)
        self.question = question
        self.options = options
        self.votes: dict[int, set[int]] = {i: set() for i in range(len(options))}
        self.user_votes: dict[int, int] = {}
        self.closed = False
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0x7B68EE))
        self.add_item(self._container)
        row = discord.ui.ActionRow()
        for i, opt in enumerate(options):
            row.add_item(PollButton(i, opt[:75]))
            if len(row.children) == 5:
                self.add_item(row)
                row = discord.ui.ActionRow()
        if row.children:
            self.add_item(row)

    def _results_str(self) -> str:
        total = sum(len(v) for v in self.votes.values())
        lines = []
        for i, opt in enumerate(self.options):
            count = len(self.votes[i])
            pct = int(count / total * 100) if total > 0 else 0
            bar = _BAR_FULL * (pct // 10) + _BAR_EMPTY * (10 - pct // 10)
            lines.append(f"**{opt}**: {bar} {pct}% ({count})")
        return "\n".join(lines)

    def _content(self) -> str:
        foot = "\n*Poll closed.*" if self.closed else "\n*Vote below — results update live.*"
        return f"## \U0001F4CA Poll\n**{self.question}**\n\n{self._results_str()}{foot}"

    def refresh(self) -> None:
        self._text.content = self._content()
        self._container.accent_colour = discord.Colour(0x00FF88 if self.closed else 0x7B68EE)

    def close(self) -> None:
        self.closed = True
        self.refresh()
        for item in self.children:
            if isinstance(item, discord.ui.ActionRow):
                for btn in item.children:
                    btn.disabled = True
