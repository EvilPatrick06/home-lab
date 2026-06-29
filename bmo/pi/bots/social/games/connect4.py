"""Connect Four game UI — Components V2."""

from typing import Optional

import discord


class _C4Button(discord.ui.Button):
    def __init__(self, col: int) -> None:
        super().__init__(label=str(col + 1), style=discord.ButtonStyle.secondary)
        self.col = col

    async def callback(self, interaction: discord.Interaction) -> None:
        await self.view._handle_drop(interaction, self.col)  # type: ignore[attr-defined]


class Connect4View(discord.ui.LayoutView):
    ROWS = 6
    COLS = 7

    def __init__(self, player1: discord.Member, player2: discord.Member) -> None:
        super().__init__(timeout=120)
        self.player1 = player1
        self.player2 = player2
        self.board: list[list[int]] = [[0] * self.COLS for _ in range(self.ROWS)]
        self.current_player = 1
        self.game_over = False
        self.winner: Optional[discord.Member] = None
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0x3498DB))
        self.add_item(self._container)
        self._rows = [discord.ui.ActionRow(*[_C4Button(c) for c in range(0, 5)]),
                      discord.ui.ActionRow(*[_C4Button(c) for c in range(5, 7)])]
        for r in self._rows:
            self.add_item(r)

    def _board_str(self) -> str:
        pieces = {0: "⚪", 1: "\U0001F534", 2: "\U0001F7E1"}
        lines = ["".join(pieces[c] for c in row) for row in self.board]
        lines.append("1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣")
        return "\n".join(lines)

    def _content(self) -> str:
        board = self._board_str()
        if self.game_over and self.winner:
            return f"## Connect 4 — {self.winner.display_name} Wins! \U0001F389\n{board}"
        if self.game_over:
            return f"## Connect 4 — Draw! \U0001F91D\n{board}"
        current = self.player1 if self.current_player == 1 else self.player2
        piece = "\U0001F534" if self.current_player == 1 else "\U0001F7E1"
        return f"## Connect 4\n{board}\n\n{piece} **{current.display_name}**'s turn"

    def _accent(self) -> int:
        if self.game_over and self.winner:
            return 0x00FF00
        if self.game_over:
            return 0xFFAA00
        return 0x3498DB

    def _drop_piece(self, col: int, player: int) -> bool:
        for row in range(self.ROWS - 1, -1, -1):
            if self.board[row][col] == 0:
                self.board[row][col] = player
                return True
        return False

    def _check_win(self, player: int) -> bool:
        b = self.board
        for r in range(self.ROWS):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r][c+1] == b[r][c+2] == b[r][c+3] == player:
                    return True
        for r in range(self.ROWS - 3):
            for c in range(self.COLS):
                if b[r][c] == b[r+1][c] == b[r+2][c] == b[r+3][c] == player:
                    return True
        for r in range(self.ROWS - 3):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r+1][c+1] == b[r+2][c+2] == b[r+3][c+3] == player:
                    return True
        for r in range(3, self.ROWS):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r-1][c+1] == b[r-2][c+2] == b[r-3][c+3] == player:
                    return True
        return False

    def _is_full(self) -> bool:
        return all(self.board[0][c] != 0 for c in range(self.COLS))

    def _disable(self) -> None:
        for r in self._rows:
            for b in r.children:
                b.disabled = True

    async def _handle_drop(self, interaction: discord.Interaction, col: int) -> None:
        current = self.player1 if self.current_player == 1 else self.player2
        if interaction.user.id != current.id:
            await interaction.response.send_message("Not your turn!", ephemeral=True)
            return
        if self.game_over:
            return
        if not self._drop_piece(col, self.current_player):
            await interaction.response.send_message("Column is full!", ephemeral=True)
            return
        if self._check_win(self.current_player):
            self.game_over = True
            self.winner = current
        elif self._is_full():
            self.game_over = True
        else:
            self.current_player = 2 if self.current_player == 1 else 1
        self._text.content = self._content()
        self._container.accent_colour = discord.Colour(self._accent())
        if self.game_over:
            self._disable()
        try:
            await interaction.response.edit_message(view=self)
        except discord.HTTPException:
            pass
        if self.game_over:
            self.stop()

    async def on_timeout(self) -> None:
        self._disable()
