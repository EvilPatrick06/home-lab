"""Hangman game UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

import random

import discord


_HANGMAN_WORDS = [
    "adventure", "algorithm", "balloon", "butterfly", "calendar",
    "chocolate", "dinosaur", "elephant", "fantastic", "geometry",
    "hamburger", "igloo", "jellyfish", "keyboard", "labyrinth",
    "mountain", "notebook", "octopus", "paradise", "question",
    "rainbow", "sandwich", "treasure", "umbrella", "vacation",
    "waterfall", "xylophone", "yourself", "zeppelin", "abstract",
    "building", "computer", "dragon", "electric", "friction",
]


_HANGMAN_STAGES = [
    "```\n  +---+\n      |\n      |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n      |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n  |   |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|   |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|\\  |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|\\  |\n /    |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|\\  |\n / \\  |\n      |\n=========\n```",
]


class HangmanGuessModal(discord.ui.Modal, title="Guess a Letter"):
    letter = discord.ui.TextInput(
        label="Enter a letter (A-Z)",
        placeholder="A",
        max_length=1,
        min_length=1,
    )

    def __init__(self, game_view: "HangmanView") -> None:
        super().__init__()
        self.game_view = game_view

    async def on_submit(self, interaction: discord.Interaction) -> None:
        guess = self.letter.value.upper()
        if not guess.isalpha():
            await interaction.response.send_message("Please enter a letter!", ephemeral=True)
            return

        gv = self.game_view
        if guess in gv.guessed:
            await interaction.response.send_message(f"You already guessed **{guess}**!", ephemeral=True)
            return

        gv.guessed.add(guess)

        if guess in gv.word_upper:
            # Correct guess
            if all(c in gv.guessed for c in gv.word_upper):
                gv.game_over = True
                gv.won = True
        else:
            gv.wrong += 1
            if gv.wrong >= 6:
                gv.game_over = True
                gv.won = False

        gv.refresh()
        try:
            await interaction.response.edit_message(view=gv)
        except discord.HTTPException:
            pass

        if gv.game_over:
            gv.stop()


class _HangmanGuessButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="Guess Letter", style=discord.ButtonStyle.primary)

    async def callback(self, interaction: discord.Interaction) -> None:
        view: "HangmanView" = self.view  # type: ignore[assignment]
        if interaction.user.id != view.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await interaction.response.send_modal(HangmanGuessModal(view))


class HangmanView(discord.ui.LayoutView):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=120)
        self.player = player
        self.word = random.choice(_HANGMAN_WORDS).upper()
        self.word_upper = self.word
        self.guessed: set[str] = set()
        self.wrong = 0
        self.game_over = False
        self.won = False
        self._btn = _HangmanGuessButton()
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0x3498DB))
        self.add_item(self._container)
        self.add_item(discord.ui.ActionRow(self._btn))

    def _word_display(self) -> str:
        return " ".join(c if c in self.guessed else "\\_" for c in self.word_upper)

    def _content(self) -> str:
        stage = _HANGMAN_STAGES[min(self.wrong, 6)]
        if self.game_over and self.won:
            return (f"## Hangman — You Win! \U0001F389\n{stage}\n**{self.word}**\n\n"
                    f"Congratulations, {self.player.display_name}!")
        if self.game_over:
            return f"## Hangman — Game Over! \U0001F480\n{stage}\n\nThe word was: **{self.word}**"
        guessed_str = " ".join(sorted(self.guessed)) if self.guessed else "None"
        return (f"## Hangman\n{stage}\n**{self._word_display()}**\n\n"
                f"Guessed: {guessed_str} · Wrong: {self.wrong}/6")

    def refresh(self) -> None:
        self._text.content = self._content()
        if self.game_over:
            self._container.accent_colour = discord.Colour(0x00FF00 if self.won else 0xFF0000)
            self._btn.disabled = True
