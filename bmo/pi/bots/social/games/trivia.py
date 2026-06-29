"""Trivia game UI — Components V2."""

import discord

_LABELS = ["🅰️", "🅱️", "🅲", "🅳"]


class TriviaButton(discord.ui.Button):
    def __init__(self, label: str, answer: str, is_correct: bool) -> None:
        super().__init__(label=label[:80], style=discord.ButtonStyle.primary)
        self.answer = answer
        self.is_correct = is_correct

    async def callback(self, interaction: discord.Interaction) -> None:
        view: "TriviaView" = self.view  # type: ignore[assignment]
        if interaction.user.id in view.answered:
            await interaction.response.send_message("You already answered!", ephemeral=True)
            return
        view.answered.add(interaction.user.id)
        if self.is_correct:
            await interaction.response.send_message(f"✅ Correct, {interaction.user.display_name}!")
        else:
            await interaction.response.send_message(
                f"❌ Wrong! The answer was: **{view.correct}**", ephemeral=True)


class TriviaView(discord.ui.LayoutView):
    def __init__(self, question: str, category: str, difficulty: str,
                 correct: str, answers: list[str]) -> None:
        super().__init__(timeout=20)
        self.question = question
        self.category = category
        self.difficulty = difficulty
        self.correct = correct
        self.answered: set[int] = set()
        self.revealed = False
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0x00BFFF))
        self.add_item(self._container)
        row = discord.ui.ActionRow()
        for i, answer in enumerate(answers):
            row.add_item(TriviaButton(f"{_LABELS[i]} {answer[:70]}", answer, answer == correct))
            if len(row.children) == 5:
                self.add_item(row); row = discord.ui.ActionRow()
        if row.children:
            self.add_item(row)

    def _content(self) -> str:
        base = (f"## \U0001F9E0 Trivia Time!\n**{self.question}**\n\n"
                f"`{self.category}` · `{self.difficulty}`")
        if self.revealed:
            return base + f"\n\n✅ Answer: **{self.correct}**"
        return base + "\n\n*You have 20 seconds to answer!*"

    def reveal(self) -> None:
        self.revealed = True
        self._text.content = self._content()
        self._container.accent_colour = discord.Colour(0x00FF88)
        for item in self.children:
            if isinstance(item, discord.ui.ActionRow):
                for btn in item.children:
                    btn.disabled = True
