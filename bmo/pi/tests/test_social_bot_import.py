"""Direct import/smoke coverage for the relocated social bot.

Previously the 6.8k-line module had no direct test importing it (only an
incidental DB-index test). After the split into bots/social/, assert the
package imports, the bot class + entry points exist, every slash command
registers, and the legacy shim re-exports the same objects.
"""

import bots.social.bot as bot


def test_module_exposes_entry_points():
    assert isinstance(bot.SocialBot, type)
    for name in ("start_social_bot", "get_social_bot", "main", "_run_social_bot"):
        assert callable(getattr(bot, name)), name


def test_extracted_logic_imported_back():
    # The pure logic now lives in games_logic but must still be reachable as
    # module attributes (the command functions reference them by bare name).
    for name in ("XP_THRESHOLDS", "_new_deck", "_hand_value", "_parse_time_str",
                 "_fuzzy_title_match", "_xp_level_for"):
        assert hasattr(bot, name), name


def test_command_tree_registers_commands(monkeypatch):
    # Construct the bot with no guild/token side effects and confirm slash
    # commands were added to the tree (the __init__ registration loop ran).
    monkeypatch.setattr(bot, "GUILD_ID", "")
    monkeypatch.setattr(bot, "BOT_TOKEN", "")
    b = bot.SocialBot()
    cmds = b.tree.get_commands()
    names = {c.name for c in cmds}
    # A representative spread across feature areas.
    for expected in ("play", "trivia", "blackjack", "poll", "remind"):
        assert expected in names, f"missing /{expected}"
    assert len(cmds) >= 50


def test_legacy_shim_reexports_same_objects():
    import bots.discord_social_bot as shim
    assert shim.SocialBot is bot.SocialBot
    assert shim.start_social_bot is bot.start_social_bot
    assert shim.main is bot.main
