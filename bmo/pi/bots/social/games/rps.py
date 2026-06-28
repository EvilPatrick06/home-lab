"""Rock-Paper-Scissors game UI — extracted verbatim from bots/social/bot.py (behaviour-identical god-module split)."""

import discord


class RPSView(discord.ui.View):
    def __init__(self, challenger: discord.Member, opponent: discord.Member) -> None:
        super().__init__(timeout=30)
        self.challenger = challenger
        self.opponent = opponent
        self.choices: dict[int, str] = {}

    async def _handle_choice(self, interaction: discord.Interaction, choice: str) -> None:
        uid = interaction.user.id
        if uid not in (self.challenger.id, self.opponent.id):
            await interaction.response.send_message("This game isn't for you!", ephemeral=True)
            return
        self.choices[uid] = choice
        await interaction.response.send_message(f"You chose **{choice}**!", ephemeral=True)

        if len(self.choices) == 2:
            self.stop()
            c1 = self.choices[self.challenger.id]
            c2 = self.choices[self.opponent.id]
            wins = {"Rock": "Scissors", "Scissors": "Paper", "Paper": "Rock"}
            if c1 == c2:
                result = "It's a **tie**! 🤝"
            elif wins[c1] == c2:
                result = f"**{self.challenger.display_name}** wins! 🎉"
            else:
                result = f"**{self.opponent.display_name}** wins! 🎉"

            embed = discord.Embed(title="Rock Paper Scissors — Results!", color=0x00FF88)
            embed.add_field(name=self.challenger.display_name, value=c1, inline=True)
            embed.add_field(name="vs", value="⚔️", inline=True)
            embed.add_field(name=self.opponent.display_name, value=c2, inline=True)
            embed.add_field(name="Result", value=result, inline=False)
            for item in self.children:
                item.disabled = True
            try:
                await interaction.message.edit(embed=interaction.message.embeds[0], view=self)
                await interaction.followup.send(embed=embed)
            except discord.HTTPException:
                pass

    @discord.ui.button(label="Rock 🪨", style=discord.ButtonStyle.primary, row=0)
    async def rock_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_choice(interaction, "Rock")

    @discord.ui.button(label="Paper 📄", style=discord.ButtonStyle.success, row=0)
    async def paper_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_choice(interaction, "Paper")

    @discord.ui.button(label="Scissors ✂️", style=discord.ButtonStyle.danger, row=0)
    async def scissors_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_choice(interaction, "Scissors")

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True
