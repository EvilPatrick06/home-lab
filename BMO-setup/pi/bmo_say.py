"""Quick script: join a VC, speak via TTS, disconnect.
Uses discord.py (not py-cord) for Dave protocol support.
"""
import asyncio, io, os, sys, logging
sys.path.insert(0, os.path.dirname(__file__))
logging.basicConfig(level=logging.DEBUG)
import discord
from cloud_providers import fish_audio_tts

TOKEN = os.environ["DISCORD_SOCIAL_BOT_TOKEN"]
GUILD_ID = 1436406356184662029
CHANNEL_ID = int(sys.argv[1])
TEXT = sys.argv[2]

intents = discord.Intents.default()
intents.voice_states = True
client = discord.Client(intents=intents)

@client.event
async def on_ready():
    guild = client.get_guild(GUILD_ID)
    vc_channel = guild.get_channel(CHANNEL_ID)
    print(f"Connecting to {vc_channel.name}...")
    vc = await vc_channel.connect()
    print(f"Connected: {vc.is_connected()}")
    loop = asyncio.get_running_loop()
    audio = await loop.run_in_executor(None, lambda: fish_audio_tts(TEXT, format="wav"))
    print(f"TTS: {len(audio)} bytes")
    source = discord.FFmpegPCMAudio(io.BytesIO(audio), pipe=True)
    vc.play(source)
    while vc.is_playing():
        await asyncio.sleep(0.5)
    print("Done playing")
    await asyncio.sleep(10)
    await vc.disconnect()
    await client.close()

client.run(TOKEN)
