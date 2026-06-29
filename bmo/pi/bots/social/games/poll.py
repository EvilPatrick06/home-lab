"""Poll UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

import discord


class PollView(discord.ui.View):
    def __init__(self, options: list[str]) -> None:
        super().__init__(timeout=300)
        self.options = options
        self.votes: dict[int, set[int]] = {i: set() for i in range(len(options))}
        # Track which option each user voted for (to allow changing vote)
        self.user_votes: dict[int, int] = {}  # user_id -> option_index

        for i, opt in enumerate(options):
            btn = PollButton(i, opt[:75])
            self.add_item(btn)

    def _results_str(self) -> str:
        total = sum(len(v) for v in self.votes.values())
        lines = []
        for i, opt in enumerate(self.options):
            count = len(self.votes[i])
            pct = int(count / total * 100) if total > 0 else 0
            bar_len = int(pct / 10)
            bar = "▰" * bar_len + "▱" * (10 - bar_len)
            lines.append(f"**{opt}**: {bar} {pct}% ({count})")
        return "\n".join(lines)


class PollButton(discord.ui.Button):
    def __init__(self, index: int, label: str) -> None:
        colors = [
            discord.ButtonStyle.primary, discord.ButtonStyle.success,
            discord.ButtonStyle.danger, discord.ButtonStyle.secondary,
        ]
        super().__init__(label=label, style=colors[index % len(colors)], row=0 if index < 2 else 1)
        self.index = index

    async def callback(self, interaction: discord.Interaction) -> None:
        view: PollView = self.view  # type: ignore[assignment]
        uid = interaction.user.id

        # Remove previous vote if any
        prev = view.user_votes.get(uid)
        if prev is not None:
            view.votes[prev].discard(uid)

        # Record new vote
        view.votes[self.index].add(uid)
        view.user_votes[uid] = self.index

        await interaction.response.send_message(
            f"You voted for **{view.options[self.index]}**!", ephemeral=True)
