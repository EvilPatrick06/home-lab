"""Rock-Paper-Scissors game UI — Components V2."""

import discord

_WINS = {"Rock": "Scissors", "Scissors": "Paper", "Paper": "Rock"}


class RPSButton(discord.ui.Button):
    def __init__(self, choice: str, label: str, style: discord.ButtonStyle) -> None:
        super().__init__(label=label, style=style)
        self.choice = choice

    async def callback(self, interaction: discord.Interaction) -> None:
        view: "RPSView" = self.view  # type: ignore[assignment]
        uid = interaction.user.id
        if uid not in (view.challenger.id, view.opponent.id):
            await interaction.response.send_message("This game isn't for you!", ephemeral=True)
            return
        view.choices[uid] = self.choice
        await interaction.response.send_message(f"You chose **{self.choice}**!", ephemeral=True)
        if len(view.choices) == 2:
            view.finish()
            try:
                await interaction.message.edit(view=view)
            except discord.HTTPException:
                pass
            view.stop()


class RPSView(discord.ui.LayoutView):
    def __init__(self, challenger: discord.Member, opponent: discord.Member) -> None:
        super().__init__(timeout=30)
        self.challenger = challenger
        self.opponent = opponent
        self.choices: dict[int, str] = {}
        self.result = ""
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0xFF6B6B))
        self.add_item(self._container)
        self.add_item(discord.ui.ActionRow(
            RPSButton("Rock", "Rock 🪨", discord.ButtonStyle.primary),
            RPSButton("Paper", "Paper 📄", discord.ButtonStyle.success),
            RPSButton("Scissors", "Scissors ✂️", discord.ButtonStyle.danger)))

    def _content(self) -> str:
        head = (f"## ✊📄✂️ Rock Paper Scissors\n"
                f"**{self.challenger.display_name}** vs **{self.opponent.display_name}**\n")
        if self.result:
            c1 = self.choices.get(self.challenger.id, "?")
            c2 = self.choices.get(self.opponent.id, "?")
            return head + (f"\n{self.challenger.display_name}: **{c1}**\n"
                           f"{self.opponent.display_name}: **{c2}**\n\n{self.result}")
        chosen = len(self.choices)
        return head + f"\nBoth players, choose your weapon! ({chosen}/2 chosen) · 30s"

    def finish(self) -> None:
        c1 = self.choices[self.challenger.id]
        c2 = self.choices[self.opponent.id]
        if c1 == c2:
            self.result = "It's a **tie**! 🤝"
        elif _WINS[c1] == c2:
            self.result = f"**{self.challenger.display_name}** wins! 🎉"
        else:
            self.result = f"**{self.opponent.display_name}** wins! 🎉"
        self._text.content = self._content()
        self._container.accent_colour = discord.Colour(0x00FF88)
        for item in self.children:
            if isinstance(item, discord.ui.ActionRow):
                for btn in item.children:
                    btn.disabled = True
