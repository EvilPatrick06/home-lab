#!/usr/bin/env python3
"""Build RAG chunk indexes for all BMO knowledge domains."""

import os
import sys
sys.path.insert(0, os.path.expanduser("~/DnD/bmo/pi"))

from services.rag_search import (
    build_index_from_markdown, build_index_from_text, save_index
)

RAG_DIR = os.path.expanduser("~/DnD/bmo/pi/data/rag_data")
REF_DIR = os.path.expanduser("~/DnD/bmo/pi/data/5e-references")


def progress(pct, msg):
    print(f"  [{pct:3d}%] {msg}")


# -- 1. D&D indexes from existing markdown reference books ----------------

def build_dnd():
    all_chunks = []
    for book in ["PHB2024", "DMG2024", "MM2025"]:
        book_dir = os.path.join(REF_DIR, book)
        # Find the markdown subdirectory (case-insensitive)
        md_dir = None
        for entry in os.listdir(book_dir):
            if entry.lower() == "markdown":
                md_dir = os.path.join(book_dir, entry)
                break
        if not md_dir:
            print(f"  ! No markdown dir in {book_dir}, skipping")
            continue
        print(f"  Building {book}...")
        chunks = build_index_from_markdown(md_dir, book, "dnd", on_progress=progress)
        all_chunks.extend(chunks)
        print(f"    -> {len(chunks)} chunks")

    if all_chunks:
        path = os.path.join(RAG_DIR, "chunk-index-dnd.json")
        save_index(all_chunks, path)
        print(f"  Saved {len(all_chunks)} D&D chunks -> {path}")
    return len(all_chunks)


# -- 2. Generated knowledge bases ----------------------------------------

ANIME_KB = """# Anime Knowledge Base

## Shonen Anime

### Dragon Ball Series
Dragon Ball, created by Akira Toriyama, follows Goku from childhood through adulthood as he trains in martial arts and searches for the Dragon Balls. Key series include Dragon Ball (1986), Dragon Ball Z (1989), Dragon Ball Super (2015), and Dragon Ball Daima (2024). Iconic techniques include Kamehameha, Spirit Bomb, and Super Saiyan transformations. Major arcs: Saiyan Saga, Frieza Saga, Cell Saga, Buu Saga, Tournament of Power.

### Naruto and Boruto
Naruto (2002) follows Naruto Uzumaki, a young ninja with the Nine-Tailed Fox sealed inside him, on his quest to become Hokage. Naruto Shippuden (2007) continues with more mature themes. Key concepts: chakra, jutsu types (ninjutsu, genjutsu, taijutsu), Sharingan, Rinnegan, Sage Mode, tailed beasts. Boruto: Naruto Next Generations follows his son. Important clans: Uchiha, Hyuga, Senju, Uzumaki.

### One Piece
One Piece (1999) by Eiichiro Oda follows Monkey D. Luffy and the Straw Hat Pirates searching for the One Piece treasure to become King of the Pirates. Devil Fruits grant supernatural powers. Haki (Observation, Armament, Conqueror's) is a key power system. Major sagas include East Blue, Alabasta, Water 7/Enies Lobby, Marineford, Whole Cake Island, Wano Country, and the Final Saga (Egghead).

### My Hero Academia
My Hero Academia (2016) is set in a world where 80% of people have superpowers called Quirks. Izuku Midoriya inherits One For All from All Might. U.A. High School trains heroes. Key characters: Bakugo, Todoroki, Uraraka, All Might, Endeavor. Villains: All For One, Shigaraki, Dabi, Toga. The series explores what it means to be a hero.

### Demon Slayer (Kimetsu no Yaiba)
Demon Slayer (2019) follows Tanjiro Kamado after his family is slaughtered by demons and his sister Nezuko is turned into one. He joins the Demon Slayer Corps to find a cure. Breathing Styles (Water, Thunder, Flame, etc.) are the combat system. Hashira are the elite demon slayers. The animation by ufotable is considered groundbreaking. Key arcs: Final Selection, Mount Natagumo, Mugen Train, Entertainment District, Swordsmith Village.

### Jujutsu Kaisen
Jujutsu Kaisen (2020) follows Yuji Itadori after he swallows a finger of Ryomen Sukuna, the King of Curses. Cursed Energy and Cursed Techniques form the power system. Domain Expansion is the ultimate technique. Key characters: Gojo Satoru (Infinity, Six Eyes), Megumi Fushiguro (Ten Shadows), Nobara Kugisaki. Shibuya Incident and Culling Game are major arcs.

### Hunter x Hunter
Hunter x Hunter (1999/2011) by Yoshihiro Togashi follows Gon Freecss searching for his father. The Nen power system (Enhancement, Transmutation, Emission, Conjuration, Manipulation, Specialization) is considered one of the best in anime. Key arcs: Hunter Exam, Heavens Arena, Yorknew City, Greed Island, Chimera Ant (widely regarded as a masterpiece), Election.

### Bleach
Bleach (2004) follows Ichigo Kurosaki who gains Soul Reaper powers. Zanpakuto are sentient swords with Shikai and Bankai releases. Soul Society, Hueco Mundo, and the Quincy Blood War are major arcs. Key characters: Rukia, Renji, Byakuya, Aizen (iconic villain), Urahara. Thousand-Year Blood War arc animated in 2022.

## Seinen Anime

### Attack on Titan (Shingeki no Kyojin)
Attack on Titan (2013) follows humanity's fight against Titans behind massive walls. Eren Yeager gains the power to transform into a Titan. Nine Titan powers, Eldians vs Marleyans, and the Rumbling are key plot elements. Considered one of the greatest anime of all time. The story by Hajime Isayama is known for its plot twists, moral complexity, and controversial ending.

### Berserk
Berserk (1997/2016) by Kentaro Miura follows Guts, the Black Swordsman, on his quest for revenge against Griffith and the God Hand after the Eclipse. Dark medieval fantasy with themes of fate, ambition, and survival. The Golden Age arc is legendary. Considered one of the greatest manga ever written.

### Vinland Saga
Vinland Saga (2019) follows Thorfinn, a young Viking warrior seeking revenge against Askeladd for killing his father. Based on historical events with Canute and the Danes. Season 2 (Farmland Saga) is a meditation on violence and pacifism. Themes of war, redemption, and finding purpose.

### Tokyo Ghoul
Tokyo Ghoul (2014) follows Ken Kaneki who becomes a half-ghoul after a transplant. Ghouls must eat human flesh to survive. RC cells, kagune types (ukaku, koukaku, rinkaku, bikaku), and the CCG organization. Explores identity and what makes someone human.

### Chainsaw Man
Chainsaw Man (2022) follows Denji, a teenage devil hunter who merges with his chainsaw devil pet Pochita. Devils embody human fears. Key characters: Makima (Control Devil), Power, Aki. Known for subverting shonen tropes with dark humor and ultraviolence.

## Isekai

### Sword Art Online
SAO (2012) trapped players in a VR MMORPG where death in-game means death in real life. Kirito and Asuna. Pioneered the modern isekai boom. Subsequent arcs: ALfheim Online, Gun Gale Online, Alicization.

### Re:Zero
Re:Zero (2016) follows Subaru Natsuki who gains Return by Death, resetting to a save point when he dies. Emilia, Rem, Ram, and the Royal Selection. Known for psychological trauma and suffering. Witch Factors and Sin Archbishops are key antagonists.

### Mushoku Tensei (Jobless Reincarnation)
Mushoku Tensei (2021) follows a reincarnated NEET in a fantasy world, growing from infant to adventurer. Considered the grandfather of modern isekai light novels. Magic system with chantless casting. World-building is exceptionally detailed.

### That Time I Got Reincarnated as a Slime
TenSura (2018) follows Satoru Mikami reincarnated as a slime named Rimuru Tempest. Nation-building focus. Skills, evolution system, and demon lords. Known for wholesome world-building and overpowered protagonist.

### Konosuba
Konosuba (2016) is an isekai comedy. Kazuma is reincarnated with the useless goddess Aqua, explosive-obsessed Megumin, and masochist crusader Darkness. Parodies isekai tropes brilliantly.

### Overlord
Overlord (2015) follows Momonga/Ainz, an undead skeleton sorcerer trapped in his game world as its most powerful being. Nazarick's Floor Guardians. Dark protagonist who is building an empire.

## Romance and Slice of Life

### Your Name (Kimi no Na wa)
Makoto Shinkai's 2016 masterpiece about body-swapping teens across time. Highest-grossing anime film when released. Stunning animation, emotional story about connection and fate.

### A Silent Voice (Koe no Katachi)
2016 film about Shoya, a former bully seeking redemption with Shoko, a deaf girl he tormented. Themes of bullying, disability, depression, and forgiveness. Deeply moving.

### Spy x Family
Spy x Family (2022) follows a spy (Loid), assassin (Yor), and telepath child (Anya) forming a fake family. Anya's reactions became iconic memes. Balances comedy, action, and heartwarming family moments.

### Frieren: Beyond Journey's End
Frieren (2023) follows an elf mage after her hero party defeats the Demon King. Explores the passage of time, memory, and what it means to understand people. Praised for its meditative pacing and emotional depth.

## Classic and Influential Anime

### Cowboy Bebop
Cowboy Bebop (1998) follows bounty hunters on the spaceship Bebop. Spike Spiegel, Jet Black, Faye Valentine, Ed, and Ein. Jazz-infused soundtrack by Yoko Kanno. Considered one of the greatest anime ever. "See you, Space Cowboy."

### Neon Genesis Evangelion
Evangelion (1995) by Hideaki Anno. Giant robots (Evas) fight Angels. Shinji Ikari's psychological struggles. Deconstructs the mecha genre. End of Evangelion and Rebuild films. Deeply influential on all subsequent anime.

### Fullmetal Alchemist: Brotherhood
FMA:B (2009) follows Edward and Alphonse Elric seeking the Philosopher's Stone to restore their bodies after a failed human transmutation. Equivalent Exchange. Homunculi villains. Consistently rated as one of the top anime of all time.

### Death Note
Death Note (2006) follows Light Yagami who finds a notebook that kills anyone whose name is written in it. Cat-and-mouse game with detective L. Explores justice, power, and corruption. "I'll take a potato chip... and eat it!"

### Steins;Gate
Steins;Gate (2011) follows eccentric scientist Okabe Rintaro discovering time travel via microwave. Butterfly effect, world lines, and Mayuri's watch. Starts slow but becomes one of the best sci-fi anime. "El Psy Kongroo."

### Code Geass
Code Geass (2006) follows Lelouch vi Britannia who gains the power of Geass (absolute obedience) and leads a rebellion as Zero. Mecha + political thriller. One of the most celebrated endings in anime history.

## Anime Recommendations by Mood

### Want Action? Try:
Jujutsu Kaisen, Demon Slayer, Mob Psycho 100, One Punch Man, Fire Force, Black Clover, Samurai Champloo

### Want to Cry? Try:
Violet Evergarden, Anohana, Your Lie in April, Clannad After Story, March Comes in Like a Lion, A Place Further Than the Universe

### Want Mind-bending? Try:
Steins;Gate, Monster, Psycho-Pass, Paranoia Agent, Serial Experiments Lain, Paprika, Perfect Blue

### Want Chill Vibes? Try:
Laid-Back Camp, Barakamon, Silver Spoon, My Roommate is a Cat, Tanaka-kun is Always Listless

### Want Dark and Mature? Try:
Berserk, Made in Abyss, Parasyte, Dorohedoro, Devilman Crybaby, Hellsing Ultimate, Gantz

## Current and Upcoming (2024-2026)
Solo Leveling (2024) follows Sung Jinwoo and his shadow army as an S-rank hunter. Dandadan (2024) combines aliens and ghosts with Science SARU animation. Blue Lock (2022-ongoing) is a soccer anime about ego striker training. Oshi no Ko (2023-ongoing) is a dark drama about the entertainment industry. Dragon Ball Daima (2024) sees Goku turned into a child again. One Piece continues in its Final Saga.
"""

GAMES_KB = """# Video Games Knowledge Base

## RPGs (Role-Playing Games)

### The Elder Scrolls Series
The Elder Scrolls by Bethesda Game Studios. Arena (1994), Daggerfall (1996), Morrowind (2002), Oblivion (2006), Skyrim (2011), Elder Scrolls VI (announced). Open world, first-person RPG set in Tamriel. Skyrim is one of the best-selling games ever. Factions include the Companions, Thieves Guild, Dark Brotherhood, College of Winterhold. Races: Nord, Imperial, Breton, Redguard, Altmer, Bosmer, Dunmer, Orsimer, Khajiit, Argonian.

### Dark Souls / Elden Ring (FromSoftware)
FromSoftware's Soulsborne games: Demon's Souls (2009), Dark Souls trilogy (2011-2016), Bloodborne (2015), Sekiro (2019), Elden Ring (2022). Known for challenging difficulty, methodical combat, interconnected world design, and cryptic lore. Elden Ring (with George R.R. Martin) won Game of the Year 2022. Shadow of the Erdtree DLC (2024). Key concepts: bonfires, estus flask, summoning, invasions, builds (strength, dex, magic, faith).

### Final Fantasy Series
Square Enix's flagship RPG series since 1987. Notable entries: FF6 (opera scene), FF7 (Sephiroth, Cloud, Aerith's death), FF9 (classic style), FF10 (Tidus, Blitzball), FF14 (MMORPG renaissance under Yoshi-P), FF15 (road trip), FF16 (action combat, Eikon battles), FF7 Rebirth (2024 remake Part 2). Turn-based to action combat evolution. Summons/Eidolons/Aeons/Eikons. Jobs system.

### The Witcher Series
CD Projekt Red. Based on Andrzej Sapkowski's novels. The Witcher 3: Wild Hunt (2015) considered one of the greatest RPGs ever. Geralt of Rivia, monster hunter. Choices matter, morally gray storytelling. Gwent card game. Hearts of Stone and Blood & Wine DLCs. Netflix adaptation. The Witcher 4 (Project Polaris) announced with Ciri.

### Baldur's Gate 3
Larian Studios (2023). D&D 5e rules-based CRPG. Won Game of the Year 2023. Enormous branching narrative, 174+ hours of cutscenes. Turn-based combat on a grid. Companions: Shadowheart, Astarion, Gale, Lae'zel, Karlach, Wyll. Mind Flayer tadpole infection drives the plot. Multiclassing, spell management, camp interactions.

### Persona Series
Atlus JRPG series. Persona 3 (memento mori), Persona 4 (murder mystery), Persona 5 (phantom thieves). Social sim + dungeon crawling. Confidants/Social Links, calendar system, stylish UI. Persona 5 Royal considered a masterpiece. Persona 6 in development. Turn-based combat with Personas (summoned spirits, weakness targeting).

### Dragon Age Series
BioWare RPG series. Origins (2009), DA2 (2011), Inquisition (2014), The Veilguard (2024). Party-based tactical RPG. Choices carry between games. Thedas setting with darkspawn, Blight, Grey Wardens, Templars vs Mages. Romance options. Companion approval systems.

### Pokemon
Nintendo/Game Freak. Since 1996. Catch, train, battle Pokemon. 1025+ species across 9 generations. Types (Fire, Water, Grass, etc.), EVs, IVs, Natures. Recent: Scarlet/Violet (2022, open world), Legends: Arceus (action RPG). Competitive battling, Smogon tiers. Pokemon Legends Z-A announced.

## Action and Adventure

### The Legend of Zelda
Nintendo franchise since 1986. Ocarina of Time (1998, revolutionary), Majora's Mask (time loop), Wind Waker (cel-shaded sailing), Twilight Princess (dark), Breath of the Wild (2017, open world revolution), Tears of the Kingdom (2023, Ultrahand building). Link, Zelda, Ganondorf. Dungeons, puzzles, exploration. BOTW/TOTK redefined open world games.

### God of War
Santa Monica Studio. Original trilogy: Greek mythology, Kratos kills the Greek gods. God of War (2018): Norse mythology reboot with Atreus/Loki. Ragnarok (2022) concludes the Norse saga. Over-the-shoulder combat, Leviathan Axe, Blades of Chaos. Egyptian mythology saga expected next.

### Monster Hunter
Capcom. Hunt large monsters, craft gear from parts, repeat. Cooperative gameplay. Monster Hunter World (2018) made the series globally mainstream. Rise (2021) added Wirebug mobility. Monster Hunter Wilds (2025) is the next major entry. Weapon types: Great Sword, Long Sword, Bow, Charge Blade, etc. (14 weapon classes).

### Hollow Knight / Metroidvanias
Hollow Knight (2017) by Team Cherry is an indie Metroidvania masterpiece. Explore Hallownest, challenging bosses, charm system. Silksong (highly anticipated sequel). Genre includes: Metroid Dread (2021), Castlevania, Ori and the Blind Forest/Will of the Wisps, Dead Cells.

## Multiplayer and Competitive

### League of Legends / MOBA
Riot Games (2009). 5v5 MOBA. 160+ champions. Lanes: Top, Jungle, Mid, Bot (ADC + Support). Ranked system (Iron to Challenger). Worlds championship. Related: Teamfight Tactics (auto-battler), Arcane (Netflix animated series). Competing MOBAs: Dota 2 (Valve).

### Valorant
Riot Games (2020). 5v5 tactical shooter. Agents with unique abilities. Maps: Bind, Haven, Ascent, etc. Ranked competitive. Combines CS:GO gunplay with Overwatch-style abilities. VCT esports circuit.

### Minecraft
Mojang/Microsoft (2011). Sandbox survival/creative. Blocks, crafting, Nether, End, Ender Dragon. Redstone engineering, mods (Forge/Fabric), servers. Best-selling game of all time (300M+ copies). Education Edition. Minecraft Legends (RTS spin-off).

### Fortnite
Epic Games (2017). Battle royale with building mechanics. 100 players. Seasonal events, collaborations (Marvel, Star Wars, etc.). Unreal Engine showcase. Creative mode. Zero Build mode added. Cultural phenomenon. OG season returns.

### Overwatch 2
Blizzard (2022, F2P relaunch). 5v5 hero shooter. Roles: Tank, Damage, Support. 30+ heroes. Competitive ranked. Seasonal model. Heroes: Tracer, Genji, Mercy, Reinhardt, Ana, etc.

## Indie Games

### Hades / Hades II
Supergiant Games. Hades (2020): roguelike, escape the Underworld as Zagreus. Boon system from Olympian gods. Incredible narrative integration with roguelike loop. Hades II (Early Access 2024): play as Melinoe against Chronos.

### Celeste
2018 precision platformer about climbing a mountain. Metaphor for anxiety and depression. Assist Mode for accessibility. Madeline. Considered one of the best indie games ever. Farewell DLC.

### Stardew Valley
ConcernedApe (2016). Farming sim inspired by Harvest Moon. Farm, fish, mine, befriend villagers, romance. Multiplayer co-op. 1.6 update (2024). Haunted Chocolate Manor announced.

### Undertale / Deltarune
Toby Fox. Undertale (2015): RPG where you can spare every enemy. Genocide and Pacifist routes. Sans, Papyrus, Flowey. Deltarune (chapters releasing). Meta-narrative, memorable characters, incredible soundtrack.

### Terraria
Re-Logic (2011). 2D sandbox with heavy focus on boss progression and loot. 17 bosses, hundreds of weapons. Journey's End update. Often compared to "2D Minecraft" but much more combat-focused.

### Inscryption
Daniel Mullins (2021). Card game / escape room / meta horror. Multiple acts that completely change genre. Leshy's cabin. Award-winning.

### Outer Wilds
Mobius Digital (2019). Space exploration mystery. 22-minute time loop, solar system to explore. No combat, pure exploration and discovery. Echoes of the Eye DLC. Widely considered one of the best games ever made for its "aha moment" design.

## Upcoming and Recent (2024-2026)
Monster Hunter Wilds (2025) is the next-gen hunting experience. GTA VI (2025) marks Rockstar's return to Vice City. Metroid Prime 4 (2025) is the long-awaited sequel. Hollow Knight: Silksong (TBA) is the most anticipated indie game. Elder Scrolls VI (TBA) is Bethesda's next chapter. Fable (2025) is Playground Games' reboot. Ghost of Yotei (2025) is Sucker Punch's sequel to Ghost of Tsushima. Doom: The Dark Ages (2025) is id Software's prequel. Death Stranding 2 (2025) from Kojima Productions. Pokemon Legends Z-A (2025) is set in Lumiose City.
"""

MOVIES_KB = """# Movies Knowledge Base

## Major Franchises

### Marvel Cinematic Universe (MCU)
Started with Iron Man (2008). Infinity Saga: 23 films culminating in Avengers: Endgame (2019). Key heroes: Iron Man (Tony Stark), Captain America (Steve Rogers), Thor, Black Widow, Hulk, Spider-Man (Tom Holland), Doctor Strange, Black Panther, Guardians of the Galaxy. Thanos and the Infinity Stones. Multiverse Saga ongoing with Kang/time travel themes. Deadpool and Wolverine (2024) revitalized the franchise. Avengers: Doomsday and Secret Wars upcoming.

### Star Wars
Original Trilogy (1977-1983): A New Hope, Empire Strikes Back, Return of the Jedi. Luke Skywalker, Darth Vader, Han Solo, Princess Leia. Prequel Trilogy (1999-2005): Anakin's fall. Sequel Trilogy (2015-2019): Rey, Kylo Ren. The Force, Jedi, Sith, lightsabers. Mandalorian TV series (Baby Yoda/Grogu). Andor (critically acclaimed). Clone Wars animated series.

### Lord of the Rings / Tolkien
Peter Jackson's trilogy (2001-2003). Fellowship, Two Towers, Return of the King. Frodo, Gandalf, Aragorn, Legolas, Gimli, Sam. The One Ring, Mordor, Sauron. Extended Editions are definitive. The Hobbit trilogy (2012-2014). Rings of Power (Amazon series). "You shall not pass!" "My precious." "One does not simply walk into Mordor."

### Harry Potter / Wizarding World
8 films (2001-2011). Hogwarts houses: Gryffindor, Hufflepuff, Ravenclaw, Slytherin. Harry, Hermione, Ron vs Voldemort. Horcruxes, Deathly Hallows, Quidditch. Fantastic Beasts series (2016-2022). HBO Max series reboot announced. Spells: Expelliarmus, Expecto Patronum, Avada Kedavra. "After all this time? Always."

### DC Extended Universe / DC Studios
Batman (Christian Bale in Nolan trilogy; Robert Pattinson in The Batman 2022). The Dark Knight (2008) considered one of the greatest films ever. Superman, Wonder Woman, Aquaman, The Flash. James Gunn's new DC Universe starting with Superman (2025). Joker (2019, Joaquin Phoenix). The Animated Series (Batman TAS) is beloved.

### Studio Ghibli
Hayao Miyazaki's Studio Ghibli. Spirited Away (2001, Oscar winner), Princess Mononoke (1997), My Neighbor Totoro (1988), Howl's Moving Castle (2004), Nausicaa (1984), Castle in the Sky (1986), Kiki's Delivery Service (1989), Ponyo (2008), The Wind Rises (2013), The Boy and the Heron (2023, Oscar). Hand-drawn animation masterpieces. Themes of nature, childhood, flight.

### Pixar / Disney Animation
Pixar: Toy Story (1995, first CGI feature), Finding Nemo, The Incredibles, WALL-E, Up, Inside Out (2015/2024), Coco, Soul, Ratatouille. Disney Animation: Frozen, Moana, Encanto, Zootopia, Tangled, Big Hero 6, Wish. Disney Renaissance: Lion King, Beauty and the Beast, Aladdin, Little Mermaid.

## Horror

### Classic Horror
The Exorcist (1973), The Shining (1980, Kubrick), Alien (1979), Halloween (1978), A Nightmare on Elm Street (1984), The Thing (1982), Psycho (1960), Jaws (1975), Rosemary's Baby (1968), The Texas Chain Saw Massacre (1974).

### Modern Horror / Elevated Horror
Get Out (2017, Jordan Peele), Hereditary (2018, Ari Aster), Midsommar (2019), The Witch (2015, Robert Eggers), It Follows (2014), A Quiet Place (2018), Barbarian (2022), Talk to Me (2023), The Menu (2022), Nope (2022). A24 studio revitalized horror.

### Horror Franchises
Scream (1996-2023, meta slasher), Conjuring Universe (8 films), Saw (torture/puzzle), Paranormal Activity (found footage), Final Destination (death's design), Evil Dead/Army of Darkness, Hellraiser, Child's Play/Chucky.

## Science Fiction

### Essential Sci-Fi Films
2001: A Space Odyssey (1968, Kubrick), Blade Runner (1982/2049), The Matrix (1999), Arrival (2016, Denis Villeneuve), Interstellar (2014, Nolan), Ex Machina (2014), Dune (2021/2024, Villeneuve), Alien/Aliens, Terminator 1 and 2, Back to the Future trilogy, E.T., The Martian (2015), Everything Everywhere All at Once (2022).

### Dune
Frank Herbert's novel adapted by Denis Villeneuve. Dune Part One (2021) and Part Two (2024). Arrakis, spice melange, sandworms. Paul Atreides (Timothee Chalamet), Lady Jessica, Chani, Baron Harkonnen. Fremen, Bene Gesserit, Spacing Guild. Dune Messiah film announced.

## Acclaimed Directors
Christopher Nolan: Dark Knight trilogy, Inception, Interstellar, Dunkirk, Tenet, Oppenheimer (2023, Oscar). Denis Villeneuve: Arrival, Blade Runner 2049, Dune 1 and 2, Sicario, Prisoners. Quentin Tarantino: Pulp Fiction, Kill Bill, Inglourious Basterds, Django Unchained, Once Upon a Time in Hollywood. Martin Scorsese: Goodfellas, Taxi Driver, The Departed, The Wolf of Wall Street, Killers of the Flower Moon. Hayao Miyazaki: see Studio Ghibli above. Bong Joon-ho: Parasite (2019, Best Picture), Snowpiercer, Memories of Murder, Okja. Jordan Peele: Get Out, Us, Nope. Wes Anderson: Grand Budapest Hotel, Moonrise Kingdom, Asteroid City, Isle of Dogs.

## Recent and Upcoming (2024-2026)
Oppenheimer (2023) won 7 Oscars including Best Picture. Dune Part Two (2024) was critically acclaimed. Deadpool and Wolverine (2024) was a massive MCU hit. Inside Out 2 (2024) became the highest-grossing animated film. Wicked (2024) adapted the musical. Avatar: Fire and Ash (2025). Superman (2025) launches James Gunn's DC Universe. Mission Impossible: The Final Reckoning (2025). Avengers: Doomsday (2026) features Robert Downey Jr. as Doctor Doom.
"""

MUSIC_KB = """# Music Knowledge Base

## Genres and Subgenres

### Rock
Classic Rock: Led Zeppelin, Pink Floyd (Dark Side of the Moon, The Wall), Queen, The Beatles, Rolling Stones, Jimi Hendrix, AC/DC, Black Sabbath. Alternative/Indie: Radiohead (OK Computer, Kid A), Arctic Monkeys, Tame Impala, The Strokes, Arcade Fire, Neutral Milk Hotel. Punk: The Ramones, Sex Pistols, Green Day, Blink-182, My Chemical Romance. Metal: Metallica, Iron Maiden, Slayer, Megadeth, Tool, Gojira, Mastodon.

### Hip-Hop and Rap
Old School: Grandmaster Flash, Run-DMC, Public Enemy. Golden Age: Nas (Illmatic), Wu-Tang Clan, A Tribe Called Quest, Biggie, Tupac. Modern: Kendrick Lamar (DAMN, Mr. Morale, GNX), J. Cole, Drake, Travis Scott, Tyler the Creator, Kanye West (MBDTF, Yeezus), MF DOOM (Madvillainy), Eminem. New wave: Playboi Carti, Yeat, Baby Keem, JID, Denzel Curry.

### Electronic / EDM
House: Daft Punk (Random Access Memories, Discovery), Disclosure. Techno: Aphex Twin, Autechre. Dubstep: Skrillex, Excision. Drum and Bass: Pendulum, Chase and Status. Synthwave: The Midnight, Kavinsky. Ambient: Brian Eno, Tycho. Lo-fi hip hop: Nujabes, Jinsang, ChilledCow/Lofi Girl. Hyperpop: 100 gecs, Charli XCX (Brat, 2024).

### Pop
Modern Pop: Taylor Swift (Eras Tour, biggest tour ever; Tortured Poets Department), Billie Eilish, Dua Lipa, The Weeknd (After Hours, Dawn FM), Olivia Rodrigo, Sabrina Carpenter, Chappell Roan (2024 breakout). K-Pop: BTS, BLACKPINK, Stray Kids, NewJeans, aespa, SEVENTEEN, TWICE. J-Pop: YOASOBI, Ado, Kenshi Yonezu, Fujii Kaze.

### R&B and Soul
Classic: Stevie Wonder, Marvin Gaye, Aretha Franklin, Prince. Neo-Soul: D'Angelo, Erykah Badu, Frank Ocean (Blonde, Channel Orange), SZA (SOS, 2022), Daniel Caesar. Modern: The Weeknd, Brent Faiyaz, Steve Lacy, Summer Walker, H.E.R.

### Jazz
Legends: Miles Davis (Kind of Blue), John Coltrane (A Love Supreme), Thelonious Monk, Charlie Parker, Duke Ellington, Billie Holiday, Louis Armstrong, Ella Fitzgerald. Modern: Kamasi Washington, Robert Glasper, Snarky Puppy, Nubya Garcia, Alfa Mist, GoGo Penguin.

### Classical
Composers: Bach, Beethoven (Moonlight Sonata, 9th Symphony), Mozart, Chopin, Debussy (Clair de Lune), Tchaikovsky (Nutcracker, Swan Lake), Vivaldi (Four Seasons), Rachmaninoff, Stravinsky. Film composers: Hans Zimmer, John Williams, Howard Shore, Joe Hisaishi (Studio Ghibli).

### Country and Folk
Country: Johnny Cash, Dolly Parton, Willie Nelson, Chris Stapleton, Zach Bryan, Morgan Wallen, Luke Combs. Outlaw Country revived. Folk: Bob Dylan, Joni Mitchell, Simon and Garfunkel, Fleet Foxes, Bon Iver, Phoebe Bridgers, Iron and Wine. Indie Folk: Mumford and Sons, The Lumineers, Hozier.

## Music for Moods and Activities

### Study/Focus Music
Lo-fi hip hop beats, classical piano (Chopin, Debussy, Satie), ambient (Brian Eno, Stars of the Lid), video game OSTs (Zelda, Final Fantasy, Persona), chillhop, jazz cafe playlists.

### Workout/Energy
High BPM: drum and bass, hardstyle, metalcore. Hip-hop bangers: DMX, Denzel Curry, Run the Jewels. Rock: Rage Against the Machine, System of a Down. EDM drops: Excision, REZZ, Sullivan King.

### Chill/Relax
Bossa nova, smooth jazz, lo-fi, indie folk, ambient electronic, Khruangbin, Mac DeMarco, Men I Trust, Beach House, Cigarettes After Sex.

### D&D / Fantasy Ambience
Epic orchestral: Two Steps from Hell, Audiomachine. Game OSTs: Skyrim (Jeremy Soule), Witcher 3 (Marcin Przybylowicz), Baldur's Gate 3, Dark Souls. Bardcore/medieval covers. Celtic/Nordic folk: Wardruna, Heilung, Danheim. D&D actual play music: Critical Role soundtrack.

### Anime Soundtracks
Iconic OPs/EDs: Cruel Angel's Thesis (Evangelion), Tank! (Cowboy Bebop), Unravel (Tokyo Ghoul), Gurenge (Demon Slayer), Kaikai Kitan (Jujutsu Kaisen). Composers: Yuki Kajiura (SAO, Demon Slayer), Hiroyuki Sawano (Attack on Titan, Kill la Kill), Kevin Penkin (Made in Abyss). YOASOBI: Idol (Oshi no Ko), Monster (Beastars).

## Streaming and Discovery
Spotify: Playlists (Discover Weekly, Release Radar), wrapped stats, podcasts. Apple Music: Lossless audio, spatial audio, curated playlists. YouTube Music: Music videos, live performances, algorithm recommendations. Bandcamp: Indie/underground, direct artist support, Bandcamp Fridays. SoundCloud: Independent artists, remixes, DJ mixes, underground scenes. Tidal: Hi-fi audio quality, artist-owned.

## Music Production Basics
DAWs: Ableton Live, FL Studio, Logic Pro, Pro Tools, Reaper, GarageBand. Key concepts: BPM (tempo), time signature, chord progressions (I-V-vi-IV), mixing, mastering, EQ, compression, reverb, delay. Instruments: Guitar (acoustic/electric), bass, drums, piano/keys, synths (analog/digital), samplers. Music theory: Major/minor scales, modes (Dorian, Mixolydian), circle of fifths, intervals, harmony.
"""


def build_domain(name, markdown_text, source_name):
    print(f"\n[{name}] Building index...")
    chunks = build_index_from_text(markdown_text, source_name, name)
    if chunks:
        path = os.path.join(RAG_DIR, f"chunk-index-{name}.json")
        save_index(chunks, path)
        print(f"  Saved {len(chunks)} chunks -> {path}")
    else:
        print(f"  ! No chunks generated for {name}")
    return len(chunks)


if __name__ == "__main__":
    os.makedirs(RAG_DIR, exist_ok=True)
    total = 0

    print("=== Building RAG Indexes ===\n")

    print("[dnd] Building D&D index from reference books...")
    total += build_dnd()

    total += build_domain("anime", ANIME_KB, "anime-knowledge-base")
    total += build_domain("games", GAMES_KB, "games-knowledge-base")
    total += build_domain("movies", MOVIES_KB, "movies-knowledge-base")
    total += build_domain("music", MUSIC_KB, "music-knowledge-base")

    print(f"\n=== Done! Total: {total} chunks across 5 domains ===")
    print(f"Index files in: {RAG_DIR}")
    os.system(f"ls -la {RAG_DIR}")
