"""Trivia game UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

import discord


class TriviaButton(discord.ui.Button):
    def __init__(self, label: str, answer: str, is_correct: bool, row: int = 0) -> None:
        display = answer[:77] + "..." if len(answer) > 80 else answer
        super().__init__(label=display, style=discord.ButtonStyle.primary, row=row)
        self.answer = answer
        self.is_correct = is_correct

    async def callback(self, interaction: discord.Interaction) -> None:
        view: TriviaView = self.view  # type: ignore[assignment]
        if interaction.user.id in view.answered:
            await interaction.response.send_message("You already answered!", ephemeral=True)
            return
        view.answered.add(interaction.user.id)
        if self.is_correct:
            await interaction.response.send_message(
                f"✅ Correct, {interaction.user.display_name}!")
        else:
            await interaction.response.send_message(
                f"❌ Wrong! The answer was: **{view.correct}**", ephemeral=True)


class TriviaView(discord.ui.View):
    def __init__(self, correct: str, answers: list[str]) -> None:
        super().__init__(timeout=20)
        self.correct = correct
        self.answered: set[int] = set()
        labels = ["🅰️", "🅱️", "🅲", "🅳"]
        for i, answer in enumerate(answers):
            self.add_item(TriviaButton(
                f"{labels[i]} {answer[:70]}", answer, answer == correct,
                row=0 if i < 2 else 1,
            ))
