"""Connect Four game UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

from typing import Optional

import discord


class Connect4View(discord.ui.View):
    ROWS = 6
    COLS = 7

    def __init__(self, player1: discord.Member, player2: discord.Member) -> None:
        super().__init__(timeout=120)
        self.player1 = player1
        self.player2 = player2
        self.board: list[list[int]] = [[0] * self.COLS for _ in range(self.ROWS)]
        self.current_player = 1  # 1 = player1 (red), 2 = player2 (yellow)
        self.game_over = False
        self.winner: Optional[discord.Member] = None

    def _board_str(self) -> str:
        pieces = {0: "⚪", 1: "🔴", 2: "🟡"}
        lines = []
        for row in self.board:
            lines.append("".join(pieces[c] for c in row))
        lines.append("1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣")
        return "\n".join(lines)

    def _drop_piece(self, col: int, player: int) -> bool:
        for row in range(self.ROWS - 1, -1, -1):
            if self.board[row][col] == 0:
                self.board[row][col] = player
                return True
        return False

    def _check_win(self, player: int) -> bool:
        b = self.board
        # Horizontal
        for r in range(self.ROWS):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r][c+1] == b[r][c+2] == b[r][c+3] == player:
                    return True
        # Vertical
        for r in range(self.ROWS - 3):
            for c in range(self.COLS):
                if b[r][c] == b[r+1][c] == b[r+2][c] == b[r+3][c] == player:
                    return True
        # Diagonal (down-right)
        for r in range(self.ROWS - 3):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r+1][c+1] == b[r+2][c+2] == b[r+3][c+3] == player:
                    return True
        # Diagonal (up-right)
        for r in range(3, self.ROWS):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r-1][c+1] == b[r-2][c+2] == b[r-3][c+3] == player:
                    return True
        return False

    def _is_full(self) -> bool:
        return all(self.board[0][c] != 0 for c in range(self.COLS))

    def _build_embed(self) -> discord.Embed:
        board_display = self._board_str()
        if self.game_over and self.winner:
            embed = discord.Embed(
                title=f"Connect 4 — {self.winner.display_name} Wins! 🎉",
                description=board_display,
                color=0x00FF00,
            )
        elif self.game_over:
            embed = discord.Embed(
                title="Connect 4 — Draw! 🤝",
                description=board_display,
                color=0xFFAA00,
            )
        else:
            current = self.player1 if self.current_player == 1 else self.player2
            piece = "🔴" if self.current_player == 1 else "🟡"
            embed = discord.Embed(
                title="Connect 4",
                description=f"{board_display}\n\n{piece} **{current.display_name}**'s turn",
                color=0x3498DB,
            )
        return embed

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

        embed = self._build_embed()
        if self.game_over:
            for item in self.children:
                item.disabled = True
        try:
            await interaction.response.edit_message(embed=embed, view=self)
        except discord.HTTPException:
            pass
        if self.game_over:
            self.stop()

    @discord.ui.button(label="1", style=discord.ButtonStyle.secondary, row=0)
    async def col1(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 0)

    @discord.ui.button(label="2", style=discord.ButtonStyle.secondary, row=0)
    async def col2(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 1)

    @discord.ui.button(label="3", style=discord.ButtonStyle.secondary, row=0)
    async def col3(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 2)

    @discord.ui.button(label="4", style=discord.ButtonStyle.secondary, row=0)
    async def col4(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 3)

    @discord.ui.button(label="5", style=discord.ButtonStyle.secondary, row=0)
    async def col5(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 4)

    @discord.ui.button(label="6", style=discord.ButtonStyle.secondary, row=1)
    async def col6(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 5)

    @discord.ui.button(label="7", style=discord.ButtonStyle.secondary, row=1)
    async def col7(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 6)

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True
