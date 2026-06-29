"""Blackjack game UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

import discord

from bots.social.games_logic import _hand_str, _hand_value, _new_deck


class BlackjackView(discord.ui.View):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=60)
        self.player = player
        self.deck = _new_deck()
        self.player_hand: list[tuple[str, str]] = [self.deck.pop(), self.deck.pop()]
        self.dealer_hand: list[tuple[str, str]] = [self.deck.pop(), self.deck.pop()]
        self.doubled = False
        self.game_over = False

    def _build_embed(self, reveal_dealer: bool = False) -> discord.Embed:
        pval = _hand_value(self.player_hand)
        embed = discord.Embed(title="🃏 Blackjack", color=0x2F8B4B)
        if reveal_dealer:
            dval = _hand_value(self.dealer_hand)
            embed.add_field(
                name=f"Dealer ({dval})",
                value=_hand_str(self.dealer_hand),
                inline=False,
            )
        else:
            embed.add_field(
                name="Dealer (?)",
                value=_hand_str(self.dealer_hand, hide_first=True),
                inline=False,
            )
        embed.add_field(
            name=f"{self.player.display_name} ({pval})",
            value=_hand_str(self.player_hand),
            inline=False,
        )
        return embed

    async def _finish(self, interaction: discord.Interaction) -> None:
        self.game_over = True
        # Dealer plays
        while _hand_value(self.dealer_hand) <= 16:
            self.dealer_hand.append(self.deck.pop())

        pval = _hand_value(self.player_hand)
        dval = _hand_value(self.dealer_hand)

        if pval > 21:
            result = "You busted! Dealer wins. 💥"
            color = 0xFF0000
        elif dval > 21:
            result = "Dealer busted! You win! 🎉"
            color = 0x00FF00
        elif pval > dval:
            result = "You win! 🎉"
            color = 0x00FF00
        elif dval > pval:
            result = "Dealer wins! 😔"
            color = 0xFF0000
        else:
            result = "It's a push! (tie) 🤝"
            color = 0xFFAA00

        embed = self._build_embed(reveal_dealer=True)
        embed.color = color
        embed.add_field(name="Result", value=result, inline=False)
        for item in self.children:
            item.disabled = True
        try:
            await interaction.response.edit_message(embed=embed, view=self)
        except discord.HTTPException:
            pass
        self.stop()

    @discord.ui.button(label="Hit", style=discord.ButtonStyle.primary, row=0)
    async def hit_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        self.player_hand.append(self.deck.pop())
        if _hand_value(self.player_hand) >= 21:
            await self._finish(interaction)
        else:
            embed = self._build_embed()
            await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="Stand", style=discord.ButtonStyle.secondary, row=0)
    async def stand_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await self._finish(interaction)

    @discord.ui.button(label="Double Down", style=discord.ButtonStyle.success, row=0)
    async def double_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        if len(self.player_hand) != 2:
            await interaction.response.send_message("Can only double on first turn!", ephemeral=True)
            return
        self.doubled = True
        self.player_hand.append(self.deck.pop())
        await self._finish(interaction)

    async def on_timeout(self) -> None:
        if not self.game_over:
            for item in self.children:
                item.disabled = True
