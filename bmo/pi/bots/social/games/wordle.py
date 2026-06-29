"""Wordle game UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

import random

import discord


_WORDLE_WORDS = [
    "about", "above", "abuse", "actor", "acute", "admit", "adopt", "adult",
    "agent", "agree", "alarm", "album", "alert", "alien", "align", "alive",
    "angel", "anger", "angle", "apple", "arena", "arise", "aside", "avoid",
    "badge", "basic", "beach", "begin", "below", "bench", "birth", "blade",
    "blank", "blast", "blaze", "blend", "blind", "block", "blood", "bloom",
    "board", "bonus", "brain", "brand", "brave", "bread", "break", "brick",
    "bride", "brief", "bring", "broad", "brown", "brush", "build", "burst",
    "candy", "cargo", "cause", "chain", "chair", "chase", "cheap", "check",
    "chest", "chief", "child", "claim", "class", "clean", "clear", "click",
    "climb", "close", "cloud", "coach", "coast", "coral", "couch", "count",
    "cover", "craft", "crash", "cream", "crime", "cross", "crowd", "crush",
    "dance", "debut", "decay", "depth", "devil", "diary", "dirty", "doubt",
    "draft", "drain", "drama", "dream", "dress", "drift", "drink", "drive",
    "eager", "earth", "eight", "elect", "empty", "enemy", "enjoy", "enter",
    "equal", "error", "event", "every", "exact", "exist", "extra", "faith",
    "false", "fault", "feast", "fence", "fetch", "fever", "fiber", "field",
    "fight", "final", "flame", "flash", "fleet", "flesh", "float", "flood",
    "floor", "flour", "fluid", "focus", "force", "forge", "forth", "found",
    "frame", "frank", "fresh", "front", "frost", "fruit", "ghost", "giant",
    "given", "glass", "globe", "gloom", "glory", "grace", "grade", "grain",
    "grand", "grant", "graph", "grasp", "grass", "grave", "great", "green",
    "greet", "grief", "grind", "gross", "group", "grove", "guard", "guess",
    "guest", "guide", "guild", "guilt", "habit", "happy", "heart", "heavy",
    "hence", "honey", "honor", "horse", "hotel", "house", "human", "humor",
    "ideal", "image", "imply", "index", "inner", "input", "irony", "ivory",
    "jewel", "joint", "judge", "juice", "knife", "knock", "known", "label",
    "labor", "large", "laser", "later", "laugh", "layer", "learn", "lease",
    "legal", "lemon", "level", "light", "limit", "linen", "liter", "logic",
    "loose", "lover", "lower", "lucky", "lunch", "magic", "major", "maker",
    "manor", "march", "match", "mayor", "media", "mercy", "metal", "meter",
    "minor", "minus", "model", "money", "month", "moral", "motor", "mount",
    "mouse", "mouth", "movie", "music", "naked", "nerve", "never", "night",
    "noble", "noise", "north", "noted", "novel", "nurse", "ocean", "offer",
    "often", "orbit", "order", "other", "outer", "owner", "oxide", "paint",
    "panel", "panic", "paper", "party", "paste", "patch", "pause", "peace",
    "penny", "phase", "phone", "photo", "piano", "piece", "pilot", "pitch",
    "place", "plain", "plane", "plant", "plate", "plaza", "plead", "point",
    "polar", "pound", "power", "press", "price", "pride", "prime", "print",
    "prior", "prize", "probe", "proof", "proud", "prove", "psalm", "pulse",
    "punch", "pupil", "queen", "quest", "queue", "quick", "quiet", "quota",
    "radar", "radio", "raise", "rally", "range", "rapid", "ratio", "reach",
    "ready", "realm", "rebel", "refer", "reign", "relax", "reply", "rider",
    "ridge", "rifle", "right", "rigid", "rival", "river", "robin", "robot",
    "rocky", "roman", "rouge", "round", "route", "royal", "rural", "saint",
    "salad", "scale", "scene", "scope", "score", "sense", "serve", "seven",
    "shade", "shake", "shall", "shame", "shape", "share", "sharp", "sheer",
    "shelf", "shell", "shift", "shine", "shirt", "shock", "shore", "short",
    "shout", "sight", "since", "sixth", "sixty", "skill", "slave", "sleep",
    "slide", "slope", "small", "smart", "smell", "smile", "smoke", "snake",
    "solar", "solid", "solve", "spare", "speak", "speed", "spend", "spill",
    "spine", "split", "sport", "spray", "squad", "stack", "staff", "stage",
    "stake", "stand", "stark", "start", "state", "steam", "steel", "steep",
    "steer", "stern", "stick", "stiff", "still", "stock", "stone", "store",
    "storm", "story", "strip", "stuck", "study", "stuff", "style", "sugar",
    "suite", "super", "swamp", "swear", "sweep", "sweet", "swift", "swing",
    "sword", "table", "taste", "teach", "tenth", "theme", "thick", "thing",
    "think", "third", "thorn", "those", "three", "throw", "thumb", "tiger",
    "tight", "tired", "title", "today", "token", "total", "touch", "tough",
    "tower", "toxic", "trace", "track", "trade", "trail", "train", "trait",
    "trash", "treat", "trend", "trial", "tribe", "trick", "troop", "truck",
    "truly", "trump", "trunk", "trust", "truth", "tumor", "twice", "twist",
    "ultra", "uncle", "under", "union", "unite", "unity", "until", "upper",
    "upset", "urban", "usage", "usual", "valid", "value", "vault", "video",
    "vigor", "virus", "visit", "vital", "vivid", "vocal", "voice", "voter",
    "waste", "watch", "water", "weave", "weigh", "weird", "whale", "wheat",
    "wheel", "where", "which", "while", "white", "whole", "whose", "widow",
    "woman", "world", "worry", "worse", "worst", "worth", "would", "wound",
    "write", "wrong", "wrote", "yield", "young", "youth",
]


class WordleGuessModal(discord.ui.Modal, title="Wordle Guess"):
    guess_input = discord.ui.TextInput(
        label="Enter a 5-letter word",
        placeholder="CRANE",
        max_length=5,
        min_length=5,
    )

    def __init__(self, game_view: "WordleView") -> None:
        super().__init__()
        self.game_view = game_view

    async def on_submit(self, interaction: discord.Interaction) -> None:
        guess = self.guess_input.value.lower()
        if not guess.isalpha() or len(guess) != 5:
            await interaction.response.send_message("Enter a valid 5-letter word!", ephemeral=True)
            return

        gv = self.game_view
        answer = gv.word

        # Build colored feedback
        result = []
        for i, c in enumerate(guess):
            if c == answer[i]:
                result.append("🟩")
            elif c in answer:
                result.append("🟨")
            else:
                result.append("⬛")

        gv.guesses.append(guess.upper())
        gv.results.append("".join(result))
        gv.attempts += 1

        if guess == answer:
            gv.game_over = True
            gv.won = True
        elif gv.attempts >= 6:
            gv.game_over = True
            gv.won = False

        gv.refresh()
        try:
            await interaction.response.edit_message(view=gv)
        except discord.HTTPException:
            pass

        if gv.game_over:
            gv.stop()


class _WordleGuessButton(discord.ui.Button):
    def __init__(self) -> None:
        super().__init__(label="Guess", style=discord.ButtonStyle.primary)

    async def callback(self, interaction: discord.Interaction) -> None:
        view: "WordleView" = self.view  # type: ignore[assignment]
        if interaction.user.id != view.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await interaction.response.send_modal(WordleGuessModal(view))


class WordleView(discord.ui.LayoutView):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=300)
        self.player = player
        self.word = random.choice(_WORDLE_WORDS)
        self.guesses: list[str] = []
        self.results: list[str] = []
        self.attempts = 0
        self.game_over = False
        self.won = False
        self._btn = _WordleGuessButton()
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0x3498DB))
        self.add_item(self._container)
        self.add_item(discord.ui.ActionRow(self._btn))

    def _board(self) -> str:
        lines = [f"{self.results[i]}  `{self.guesses[i]}`" for i in range(len(self.guesses))]
        for _ in range(6 - len(self.guesses)):
            lines.append("⬛⬛⬛⬛⬛")
        return "\n".join(lines)

    def _content(self) -> str:
        board = self._board()
        if self.game_over and self.won:
            return f"## Wordle — You Win! \U0001F389 ({self.attempts}/6)\n{board}"
        if self.game_over:
            return f"## Wordle — Game Over!\n{board}\n\nThe word was: **{self.word.upper()}**"
        return f"## Wordle ({self.attempts}/6)\n{board}\n\n*Click the button to submit a guess!*"

    def refresh(self) -> None:
        self._text.content = self._content()
        if self.game_over:
            self._container.accent_colour = discord.Colour(0x00FF00 if self.won else 0xFF0000)
            self._btn.disabled = True
