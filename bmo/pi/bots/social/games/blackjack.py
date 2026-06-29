"""Blackjack game UI — Components V2."""

import discord

from bots.social.games_logic import _hand_str, _hand_value, _new_deck


class _BJButton(discord.ui.Button):
    def __init__(self, label: str, style: discord.ButtonStyle, action: str) -> None:
        super().__init__(label=label, style=style)
        self.action = action

    async def callback(self, interaction: discord.Interaction) -> None:
        view: "BlackjackView" = self.view  # type: ignore[assignment]
        if interaction.user.id != view.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await getattr(view, self.action)(interaction)


class BlackjackView(discord.ui.LayoutView):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=60)
        self.player = player
        self.deck = _new_deck()
        self.player_hand: list[tuple[str, str]] = [self.deck.pop(), self.deck.pop()]
        self.dealer_hand: list[tuple[str, str]] = [self.deck.pop(), self.deck.pop()]
        self.doubled = False
        self.game_over = False
        self.reveal = False
        self.result = ""
        self._text = discord.ui.TextDisplay(self._content())
        self._container = discord.ui.Container(self._text, accent_colour=discord.Colour(0x2F8B4B))
        self.add_item(self._container)
        self._row = discord.ui.ActionRow(
            _BJButton("Hit", discord.ButtonStyle.primary, "hit"),
            _BJButton("Stand", discord.ButtonStyle.secondary, "stand"),
            _BJButton("Double Down", discord.ButtonStyle.success, "double"))
        self.add_item(self._row)

    def _content(self) -> str:
        pval = _hand_value(self.player_hand)
        if self.reveal:
            dval = _hand_value(self.dealer_hand)
            dealer = f"**Dealer ({dval})**\n{_hand_str(self.dealer_hand)}"
        else:
            dealer = f"**Dealer (?)**\n{_hand_str(self.dealer_hand, hide_first=True)}"
        player = f"**{self.player.display_name} ({pval})**\n{_hand_str(self.player_hand)}"
        out = f"## \U0001F0CF Blackjack\n{dealer}\n\n{player}"
        if self.result:
            out += f"\n\n**{self.result}**"
        return out

    def _refresh(self, accent: int = 0x2F8B4B) -> None:
        self._text.content = self._content()
        self._container.accent_colour = discord.Colour(accent)

    def _disable(self) -> None:
        for b in self._row.children:
            b.disabled = True

    async def _finish(self, interaction: discord.Interaction) -> None:
        self.game_over = True
        self.reveal = True
        while _hand_value(self.dealer_hand) <= 16:
            self.dealer_hand.append(self.deck.pop())
        pval = _hand_value(self.player_hand)
        dval = _hand_value(self.dealer_hand)
        if pval > 21:
            self.result, accent = "You busted! Dealer wins. \U0001F4A5", 0xFF0000
        elif dval > 21:
            self.result, accent = "Dealer busted! You win! \U0001F389", 0x00FF00
        elif pval > dval:
            self.result, accent = "You win! \U0001F389", 0x00FF00
        elif dval > pval:
            self.result, accent = "Dealer wins! \U0001F614", 0xFF0000
        else:
            self.result, accent = "It's a push! (tie) \U0001F91D", 0xFFAA00
        self._disable()
        self._refresh(accent)
        try:
            await interaction.response.edit_message(view=self)
        except discord.HTTPException:
            pass
        self.stop()

    async def hit(self, interaction: discord.Interaction) -> None:
        self.player_hand.append(self.deck.pop())
        if _hand_value(self.player_hand) >= 21:
            await self._finish(interaction)
        else:
            self._refresh()
            try:
                await interaction.response.edit_message(view=self)
            except discord.HTTPException:
                pass

    async def stand(self, interaction: discord.Interaction) -> None:
        await self._finish(interaction)

    async def double(self, interaction: discord.Interaction) -> None:
        if len(self.player_hand) != 2:
            await interaction.response.send_message("Can only double on first turn!", ephemeral=True)
            return
        self.doubled = True
        self.player_hand.append(self.deck.pop())
        await self._finish(interaction)

    def maybe_natural(self) -> None:
        if _hand_value(self.player_hand) == 21:
            self.game_over = True
            self.reveal = True
            if _hand_value(self.dealer_hand) == 21:
                self.result, accent = "Both blackjack! Push! \U0001F91D", 0xFFAA00
            else:
                self.result, accent = "Blackjack! You win! \U0001F389", 0x00FF00
            self._disable()
            self._refresh(accent)

    async def on_timeout(self) -> None:
        if not self.game_over:
            self._disable()
