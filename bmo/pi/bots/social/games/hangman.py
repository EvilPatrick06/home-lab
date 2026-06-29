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

        embed = gv._build_embed()
        if gv.game_over:
            for item in gv.children:
                item.disabled = True
        try:
            await interaction.response.edit_message(embed=embed, view=gv)
        except discord.HTTPException:
            pass

        if gv.game_over:
            gv.stop()


class HangmanView(discord.ui.View):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=120)
        self.player = player
        self.word = random.choice(_HANGMAN_WORDS).upper()
        self.word_upper = self.word
        self.guessed: set[str] = set()
        self.wrong = 0
        self.game_over = False
        self.won = False

    def _word_display(self) -> str:
        return " ".join(c if c in self.guessed else "\\_" for c in self.word_upper)

    def _build_embed(self) -> discord.Embed:
        stage = _HANGMAN_STAGES[min(self.wrong, 6)]
        word_display = self._word_display()
        guessed_str = " ".join(sorted(self.guessed)) if self.guessed else "None"

        if self.game_over and self.won:
            embed = discord.Embed(title="Hangman — You Win! 🎉", color=0x00FF00)
            embed.description = f"{stage}\n**{self.word}**\n\nCongratulations, {self.player.display_name}!"
        elif self.game_over:
            embed = discord.Embed(title="Hangman — Game Over! 💀", color=0xFF0000)
            embed.description = f"{stage}\n\nThe word was: **{self.word}**"
        else:
            embed = discord.Embed(title="Hangman", color=0x3498DB)
            embed.description = f"{stage}\n**{word_display}**"
            embed.add_field(name="Guessed", value=guessed_str, inline=True)
            embed.add_field(name="Wrong", value=f"{self.wrong}/6", inline=True)
        return embed

    @discord.ui.button(label="Guess Letter", style=discord.ButtonStyle.primary, row=0)
    async def guess_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await interaction.response.send_modal(HangmanGuessModal(self))
