import {
  BookOpen,
  Brain,
  Calendar,
  Clock,
  Compass,
  Copy,
  FileUp,
  FlaskConical,
  Hash,
  Heart,
  ImagePlus,
  Library,
  MessageSquare,
  Package,
  RotateCcw,
  Scroll,
  ScrollText,
  Settings,
  ShoppingBag,
  Skull,
  Star,
  Swords,
  Target,
  Trophy,
  Wand2,
} from 'lucide-react';
import { AudioInviteBanner } from '../../components/AudioInviteBanner.jsx';
import RichContent from '../../components/RichContent.jsx';
import { SignInButton } from '../../components/SignInButton.jsx';
import { CollapsibleGroup } from '../../components/ui/CollapsibleGroup.jsx';
import { ModeCard } from '../../components/ui/ModeCard.jsx';
import { OrnatePanel } from '../../components/ui/OrnatePanel.jsx';
import { ACHIEVEMENTS } from '../../game/achievements.js';
import { todayDateStr } from '../../services/devotion.js';
import { dueCount } from '../../services/srs.js';
import AudioPanel from './AudioPanel.jsx';
import ThemePanel from './ThemePanel.jsx';

// 25h: collapsible section wrapper used by the reorganized Home screen.
// Default-open so first-time users see everything; the player's choices are
// session-scoped (no persistence) — the home grid is short enough that this
// keeps the implementation small while letting players collapse what they
// don't need today.
function HomeScreen({
  courseSet,
  tomeProgress,
  setScreen,
  trackModeUse,
  onImport,
  onPaste,
  onImportCode,
  onImportDeck,
  onAuthorOcclusion,
  onShowPrompt,
  playerState,
  signedIn,
  onResetProgress,
  onOpenLibrary,
  onRestartTutorial,
  onShowAchievements,
  onEnterReviews,
  onSetTheme,
  onSetLocale,
  onToggleColorblind,
}) {
  const reviewsDue = dueCount(tomeProgress?.cardProgress || {}, courseSet?.flashcards || []);
  if (!courseSet) {
    return (
      <div className="space-y-6">
        <AudioInviteBanner />
        <div
          className="text-center py-12 px-6 rounded-sm relative"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.7) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.9) 100%)',
            border: '3px double rgba(180, 83, 9, 0.5)',
            boxShadow: '0 0 40px rgba(180, 83, 9, 0.2), inset 0 0 30px rgba(0,0,0,0.6)',
          }}
        >
          <div className="absolute top-2 left-2 text-amber-700 text-lg">⚜</div>
          <div className="absolute top-2 right-2 text-amber-700 text-lg">⚜</div>
          <div className="absolute bottom-2 left-2 text-amber-700 text-lg">⚜</div>
          <div className="absolute bottom-2 right-2 text-amber-700 text-lg">⚜</div>

          <Scroll
            className="w-20 h-20 mx-auto text-amber-500 mb-4"
            style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }}
          />
          <h2
            className="text-3xl font-bold mb-3 text-amber-300 italic"
            style={{ textShadow: '0 0 15px rgba(245, 158, 11, 0.4)' }}
          >
            ~ The Library Awaits ~
          </h2>
          <p className="text-amber-100/80 mb-6 max-w-md mx-auto italic leading-relaxed">
            {playerState.library.length === 0
              ? '"Brave scholar, no tome graces your shelves. Bring forth a sacred text and your quest shall begin..."'
              : `"You have tomes in your collection but none is open. Visit the library to choose a path..."`}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {playerState.library.length > 0 && (
              <button
                onClick={onOpenLibrary}
                className="px-6 py-3 font-bold rounded-sm flex items-center gap-2 transition text-amber-950 border-2 border-amber-300 italic"
                style={{
                  background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #b45309 100%)',
                  boxShadow: '0 0 20px rgba(245, 158, 11, 0.5)',
                }}
              >
                <Library className="w-5 h-5" /> Open Library
              </button>
            )}
            <button
              onClick={onImport}
              className="px-6 py-3 font-bold rounded-sm flex items-center gap-2 transition text-amber-200 border-2 border-amber-700 italic"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.9) 100%)',
              }}
            >
              <Scroll className="w-5 h-5" /> Inscribe a Tome
            </button>
            <button
              onClick={onPaste}
              className="px-6 py-3 font-bold rounded-sm flex items-center gap-2 transition text-amber-200 border-2 border-amber-700 italic"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.9) 100%)',
              }}
            >
              <Copy className="w-5 h-5" /> Paste Tome Text
            </button>
            <button
              onClick={onImportCode}
              className="px-6 py-3 font-bold rounded-sm flex items-center gap-2 transition text-purple-200 border-2 border-purple-700 italic"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(76, 29, 149, 0.6) 0%, rgba(var(--surface-purple, 31, 12, 41), 0.9) 100%)',
              }}
            >
              <Hash className="w-5 h-5" /> Import Share Code
            </button>
            <button
              onClick={onImportDeck}
              className="px-6 py-3 font-bold rounded-sm flex items-center gap-2 transition text-emerald-200 border-2 border-emerald-700 italic"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(6, 78, 59, 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.9) 100%)',
              }}
            >
              <FileUp className="w-5 h-5" /> Import Deck (CSV/Quizlet)
            </button>
            <button
              onClick={onAuthorOcclusion}
              className="px-6 py-3 font-bold rounded-sm flex items-center gap-2 transition text-emerald-200 border-2 border-emerald-700 italic"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(6, 78, 59, 0.6) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.9) 100%)',
              }}
            >
              <ImagePlus className="w-5 h-5" /> Author Occlusion Card
            </button>
            <button
              onClick={onShowPrompt}
              className="px-6 py-3 font-bold rounded-sm flex items-center gap-2 transition text-amber-200 border-2 border-amber-700 italic"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.9) 100%)',
              }}
            >
              <Wand2 className="w-5 h-5" /> Forge Tome with Magic
            </button>
          </div>
        </div>

        <OrnatePanel color="purple">
          <h3
            className="text-lg font-bold mb-4 text-purple-300 flex items-center gap-2 italic"
            style={{ textShadow: '0 0 10px rgba(168, 85, 247, 0.4)' }}
          >
            <BookOpen className="w-5 h-5" /> ✦ What Lies Within a Sacred Tome ✦
          </h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="flex gap-3">
              <Brain className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-cyan-300 italic">Scrolls of Knowledge</div>
                <div className="text-amber-100/70 text-xs">Term and definition pairs for memorization</div>
              </div>
            </div>
            <div className="flex gap-3">
              <Target className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-purple-300 italic">Riddles of Wisdom</div>
                <div className="text-amber-100/70 text-xs">Multiple choice, true/false, and arcane riddles</div>
              </div>
            </div>
            <div className="flex gap-3">
              <FlaskConical className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-rose-300 italic">Trials of Skill</div>
                <div className="text-amber-100/70 text-xs">Hands-on quests with steps and validation</div>
              </div>
            </div>
            <div className="flex gap-3">
              <MessageSquare className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-300 italic">The Oracle's Wisdom</div>
                <div className="text-amber-100/70 text-xs">Reference text the AI sage draws upon</div>
              </div>
            </div>
          </div>
        </OrnatePanel>

        <OrnatePanel color="amber">
          <h3 className="text-lg font-bold mb-3 text-amber-300 flex items-center gap-2 italic">
            <Settings className="w-5 h-5" /> ⚔ Sage Management ⚔
          </h3>
          {/* Phase 33h QA P8: safe actions in one row, destructive in its own
              row with a warning preamble so the user can't mis-click. */}
          <div className="flex flex-wrap gap-3">
            {!playerState.tutorialCompleted && !playerState.tutorialStarted && (
              <button
                onClick={onRestartTutorial}
                className="px-4 py-2 rounded-sm flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
                style={{ background: 'rgba(var(--surface-purple, 31, 12, 41), 0.7)' }}
              >
                <Compass className="w-4 h-4" /> Begin Tutorial
              </button>
            )}
            {(playerState.tutorialCompleted || playerState.tutorialStartedAndSkipped) && (
              <button
                onClick={onRestartTutorial}
                className="px-4 py-2 rounded-sm flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
                style={{ background: 'rgba(var(--surface-purple, 31, 12, 41), 0.7)' }}
              >
                <Compass className="w-4 h-4" /> Replay Tutorial
              </button>
            )}
            {!signedIn && <SignInButton />}
          </div>
          <div className="mt-3 pt-3 border-t border-red-900/40">
            <div className="text-[10px] uppercase tracking-wider italic text-red-400/80 mb-2 font-bold">
              ⚠ Destructive
            </div>
            <button
              onClick={onResetProgress}
              className="px-4 py-2 rounded-sm flex items-center gap-2 text-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic"
              style={{ background: 'rgba(var(--surface-red, 41, 12, 12), 0.7)' }}
              aria-label="Begin Anew — permanently erases all local progress (a confirmation dialog will appear)"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> Begin Anew
            </button>
            <span className="ml-3 text-[10px] italic text-red-300/70">
              Erases all local progress. Confirmation required.
            </span>
          </div>
        </OrnatePanel>

        <AudioPanel />
        <ThemePanel
          currentTheme={playerState.theme || 'dark'}
          onSetTheme={onSetTheme}
          currentLocale={playerState.locale || 'en'}
          onSetLocale={onSetLocale}
          colorblind={!!playerState.colorblind}
          onToggleColorblind={onToggleColorblind}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AudioInviteBanner />
      <div
        className="p-6 rounded-sm relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber-strong, 120, 53, 15), 0.4) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.9) 100%)',
          border: '3px double rgba(245, 158, 11, 0.5)',
          boxShadow: '0 0 30px rgba(245, 158, 11, 0.2), inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        <div className="absolute top-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute top-2 right-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 left-2 text-amber-500 text-sm">⚜</div>
        <div className="absolute bottom-2 right-2 text-amber-500 text-sm">⚜</div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex-1 min-w-[250px]">
            <div className="text-xs text-amber-600 tracking-[0.3em] mb-1">⚔ ACTIVE TOME ⚔</div>
            <h2
              className="text-2xl font-bold text-amber-200 italic"
              style={{ textShadow: '0 0 12px rgba(245, 158, 11, 0.4)' }}
            >
              {courseSet.metadata.title}
            </h2>
            {courseSet.metadata.description && (
              /* Phase 34a QA P11: render rich content in active-tome description. */
              <RichContent text={courseSet.metadata.description} className="text-amber-100/70 text-sm mt-1 italic" />
            )}
            {(courseSet.metadata.subject || courseSet.metadata.author || courseSet.metadata.difficulty) && (
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                {courseSet.metadata.subject && (
                  <span
                    className="px-2 py-0.5 rounded-sm italic"
                    style={{
                      background: 'rgba(var(--surface-purple, 31, 12, 41), 0.7)',
                      border: '1px solid rgba(126, 34, 206, 0.5)',
                      color: '#d8b4fe',
                    }}
                  >
                    📚 {courseSet.metadata.subject}
                  </span>
                )}
                {courseSet.metadata.author && (
                  <span
                    className="px-2 py-0.5 rounded-sm italic"
                    style={{
                      background: 'rgba(12, 24, 41, 0.7)',
                      border: '1px solid rgba(29, 78, 216, 0.5)',
                      color: '#93c5fd',
                    }}
                  >
                    ✒️ {courseSet.metadata.author}
                  </span>
                )}
                {courseSet.metadata.difficulty && (
                  <span
                    className="px-2 py-0.5 rounded-sm italic"
                    style={{
                      background: 'rgba(41, 12, 12, 0.7)',
                      border: '1px solid rgba(185, 28, 28, 0.5)',
                      color: '#fca5a5',
                    }}
                  >
                    {'★'.repeat(courseSet.metadata.difficulty)}
                    {'☆'.repeat(5 - courseSet.metadata.difficulty)}
                  </span>
                )}
              </div>
            )}
            {courseSet.metadata.tags && courseSet.metadata.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {courseSet.metadata.tags.map((tag, ti) => (
                  <span
                    key={ti}
                    className="px-2 py-0.5 rounded-sm text-[10px] italic"
                    style={{
                      background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: '#fcd34d',
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-4 mt-3 text-xs text-amber-300/80">
              <span>📜 {courseSet.flashcards?.length || 0} scrolls</span>
              <span>🎯 {courseSet.quiz?.length || 0} riddles</span>
              <span>⚗️ {courseSet.labs?.length || 0} trials</span>
              {(tomeProgress?.runsCompleted || 0) > 0 && <span>⚔️ {tomeProgress.runsCompleted} runs completed</span>}
            </div>
          </div>
          <button
            onClick={onOpenLibrary}
            className="px-4 py-2 rounded-sm text-sm border-2 border-amber-700 text-amber-200 flex items-center gap-2 hover:bg-amber-900/30 italic"
            style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
          >
            <Library className="w-4 h-4" /> Library ({playerState.library.length})
          </button>
        </div>
      </div>

      {/* 25h: home reorg — 4 collapsible groups (Study / Utility / Daily
          Rewards / Account). Spellbook moved into Inventory's Spells tab. */}
      <CollapsibleGroup title="Study" icon="📜" color="red">
        <div className="grid md:grid-cols-2 gap-4">
          <ModeCard
            title="Dungeon Delve"
            desc="Walk a top-down realm of themed biomes (Crypt, Sewers, Tower, Halls, Wastes). Bump into foes to face their riddles, and reach the dungeon lord at the end to claim victory."
            icon={<Swords className="w-8 h-8" />}
            color="red"
            featured
            onClick={() => {
              trackModeUse('dungeon');
              setScreen('dungeon');
            }}
          />
          <ModeCard
            title="Scrolls of Knowledge"
            desc="Study sacred scrolls at your own pace. Rate your mastery to focus on what eludes you."
            icon={<Scroll className="w-8 h-8" />}
            color="sapphire"
            disabled={(courseSet?.flashcards?.length || 0) === 0}
            disabledReason="This tome has no scrolls — inscribe one with flashcards to enable."
            onClick={() => {
              trackModeUse('flashcards');
              setScreen('flashcards');
            }}
          />
          <ModeCard
            title="Riddles of the Sphinx"
            desc="Test your wisdom against ancient riddles. Multiple paths, true judgment, and arcane fill-ins."
            icon={<Target className="w-8 h-8" />}
            color="purple"
            disabled={(courseSet?.quiz?.length || 0) === 0}
            disabledReason="This tome has no riddles — inscribe one with quiz items to enable."
            onClick={() => {
              trackModeUse('quiz');
              setScreen('quiz');
            }}
          />
          <ModeCard
            title="Trials of Skill"
            desc="Face hands-on trials at your own pace. Step-by-step quests with validation by the ancients."
            icon={<FlaskConical className="w-8 h-8" />}
            color="rose"
            disabled={(courseSet?.labs?.length || 0) === 0}
            disabledReason="This tome has no trials — inscribe one with lab items to enable."
            onClick={() => {
              trackModeUse('lab');
              setScreen('lab');
            }}
          />
          <ModeCard
            title="The Oracle"
            desc="Commune with the AI Oracle. Seek explanations, request riddles, and uncover deeper mysteries of this tome."
            icon={<Wand2 className="w-8 h-8" />}
            color="amber"
            onClick={() => {
              trackModeUse('chat');
              setScreen('chat');
            }}
          />
          <ModeCard
            title="Domain Codex"
            desc="Survey thy mastery across every domain of the cert blueprint. Study weak veins via Riddles or Scrolls — focus on what slips thee."
            icon={<BookOpen className="w-8 h-8" />}
            color="emerald"
            onClick={() => setScreen('domainStudy')}
          />
          <ModeCard
            title="The Trial of Hours"
            desc="Sit a timed full-length mock exam. Riddles are drawn in proportion to the blueprint, the sands cannot be paused, and a verdict is rendered when thou dost submit."
            icon={<Clock className="w-8 h-8" />}
            color="purple"
            disabled={(courseSet?.quiz?.length || 0) < 5}
            disabledReason="A trial needs at least 5 riddles — current tome has too few."
            onClick={() => {
              trackModeUse('practiceExam');
              setScreen('practiceExam');
            }}
          />
          <ModeCard
            title={reviewsDue > 0 ? `✦ Reviews Due (${reviewsDue}) ✦` : 'Reviews Due'}
            desc={
              reviewsDue > 0
                ? `${reviewsDue} scroll${reviewsDue === 1 ? '' : 's'} await${reviewsDue === 1 ? 's' : ''} thy review — the spaced-repetition oracle hath scheduled them for today. Drill while memory is fresh.`
                : `No scrolls due — return on the morrow. Every scroll thou ratest schedules its next visit.`
            }
            icon={<RotateCcw className="w-8 h-8" />}
            color={reviewsDue > 0 ? 'sapphire' : 'amber'}
            onClick={() => {
              if (reviewsDue > 0) onEnterReviews?.();
            }}
          />
        </div>
      </CollapsibleGroup>

      <CollapsibleGroup title="Utility" icon="⚒️" color="sapphire">
        <div className="grid md:grid-cols-2 gap-4">
          <ModeCard
            title="Inventory"
            desc={`Thy hoard of gear, potions, and spells. ${Object.values(playerState?.inventory || {}).reduce((s, n) => s + (n || 0), 0)} item${Object.values(playerState?.inventory || {}).reduce((s, n) => s + (n || 0), 0) === 1 ? '' : 's'} stowed.`}
            icon={<Package className="w-8 h-8" />}
            color="emerald"
            onClick={() => setScreen('inventory')}
          />
          <ModeCard
            title="The Stable"
            desc={`Hatched familiars walk at thy side. ${Object.keys(playerState?.pets || {}).length}/${5} pets in thy stable.`}
            icon={<Heart className="w-8 h-8" />}
            color="emerald"
            onClick={() => setScreen('stable')}
          />
          <ModeCard
            title="The Marketplace"
            desc="Spend thy hard-won gold on potions, cosmetics, and permanent boons. Wares rotate at each dawn."
            icon={<ShoppingBag className="w-8 h-8" />}
            color="amber"
            onClick={() => setScreen('shop')}
          />
          <ModeCard
            title="Quest Board"
            desc="Daily quests await thy completion. New challenges arise each dawn — claim experience as thy reward."
            icon={<ScrollText className="w-8 h-8" />}
            color="purple"
            onClick={() => setScreen('quests')}
          />
        </div>
      </CollapsibleGroup>

      <CollapsibleGroup title="Daily Rewards" icon="🕯️" color="amber">
        <div className="grid md:grid-cols-2 gap-4">
          <ModeCard
            title={playerState?.lastClaimedDate === todayDateStr() ? 'Devotion Calendar' : '✦ Devotion Awaits ✦'}
            desc={
              playerState?.lastClaimedDate === todayDateStr()
                ? `Today's flame is lit. Streak: ${playerState?.loginStreak || 0} day${(playerState?.loginStreak || 0) === 1 ? '' : 's'}. Devotion: ${playerState?.devotion || 0}.`
                : `A daily offering awaits thee. Current streak: ${playerState?.loginStreak || 0}. Claim today's reward.`
            }
            icon={<Calendar className="w-8 h-8" />}
            color="amber"
            onClick={() => setScreen('calendar')}
          />
          {/* Phase 46b: expanded Ascension card copy. The single-line
              "Reach level 50… Tokens earned: 0" reads as meaningless
              without explaining what transcending does or what Tokens
              unlock. Now spells out: reset/keep semantics + Celestial
              shop unlock so users can decide whether to pursue it. */}
          <ModeCard
            title={(playerState?.ascensions || 0) > 0 ? `Ascension ×${playerState.ascensions}` : 'Path of Ascension'}
            desc={
              (playerState?.level || 1) >= 50
                ? `The cycle stands ready to renew — reset level/gold/gear, keep identity/lore/stable, earn +1 Ascension Token. Tokens unlock Celestial shop (eternal boons). Current: ${playerState?.ascensionTokens || 0}.`
                : `Transcend at L50 to reset level/gold/gear (keep identity/lore/stable) and earn an Ascension Token — Tokens unlock Celestial shop (eternal boons). Current: L${playerState?.level || 1} · Tokens: ${playerState?.ascensionTokens || 0}.`
            }
            icon={<Star className="w-8 h-8" />}
            color="amber"
            onClick={() => setScreen('ascension')}
          />
        </div>
      </CollapsibleGroup>

      <CollapsibleGroup title="Account" icon="📚" color="purple">
        <div className="grid md:grid-cols-2 gap-4">
          <ModeCard
            title="Hall of Glory"
            desc={`Achievements earned through valor. ${(playerState?.achievements || []).length}/${ACHIEVEMENTS.length} unlocked.`}
            icon={<Trophy className="w-8 h-8" />}
            color="amber"
            onClick={() => onShowAchievements?.()}
          />
          <ModeCard
            title="Tome of Failures"
            desc={`Confront the questions that have bested you. ${(tomeProgress?.mistakeVault || []).length} foe${(tomeProgress?.mistakeVault || []).length === 1 ? '' : 's'} await redemption.`}
            icon={<Skull className="w-8 h-8" />}
            color="emerald"
            onClick={() => setScreen('vault')}
          />
          {/* Phase 46f: empty Chronicle / Bestiary cards now spell out
              how entries arrive, since 0/0 + no hint reads as a broken
              tab. Once entries exist, the unlock copy collapses to the
              existing count + lore line. */}
          <ModeCard
            title="Chronicle of Delves"
            desc={
              (tomeProgress?.runHistory || []).length === 0
                ? `Each completed dungeon delve becomes a chronicled chapter — start a delve from the Dungeon to inscribe thy first.`
                : `Review past dungeon runs, personal records, and per-question reviews. ${(tomeProgress?.runHistory || []).length} delve${(tomeProgress?.runHistory || []).length === 1 ? '' : 's'} chronicled.`
            }
            icon={<Scroll className="w-8 h-8" />}
            color="purple"
            onClick={() => setScreen('history')}
          />
          <ModeCard
            title="Bestiary"
            desc={
              Object.keys(playerState?.bestiary || {}).length === 0
                ? `Defeat each foe at least once in the Dungeon to unlock its lore — entries unlock automatically as thou prevail.`
                : `Lore on every foe felled in the dungeon. ${Object.keys(playerState?.bestiary || {}).length}/${20} entries unlocked.`
            }
            icon={<Skull className="w-8 h-8" />}
            color="purple"
            onClick={() => setScreen('bestiary')}
          />
        </div>

        <OrnatePanel color="amber">
          <h3 className="text-lg font-bold mb-3 text-amber-300 flex items-center gap-2 italic">
            <Settings className="w-5 h-5" /> ⚔ Sage Management ⚔
          </h3>
          {/* Phase 33h QA P8: safe actions in one row, destructive in its own
              row with a warning preamble so the user can't mis-click. */}
          <div className="flex flex-wrap gap-3">
            {!playerState.tutorialCompleted && !playerState.tutorialStarted && (
              <button
                onClick={onRestartTutorial}
                className="px-4 py-2 rounded-sm flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
                style={{ background: 'rgba(var(--surface-purple, 31, 12, 41), 0.7)' }}
              >
                <Compass className="w-4 h-4" /> Begin Tutorial
              </button>
            )}
            {(playerState.tutorialCompleted || playerState.tutorialStartedAndSkipped) && (
              <button
                onClick={onRestartTutorial}
                className="px-4 py-2 rounded-sm flex items-center gap-2 text-sm border-2 border-purple-700 text-purple-200 hover:bg-purple-900/30 italic"
                style={{ background: 'rgba(var(--surface-purple, 31, 12, 41), 0.7)' }}
              >
                <Compass className="w-4 h-4" /> Replay Tutorial
              </button>
            )}
            {!signedIn && <SignInButton />}
          </div>
          <div className="mt-3 pt-3 border-t border-red-900/40">
            <div className="text-[10px] uppercase tracking-wider italic text-red-400/80 mb-2 font-bold">
              ⚠ Destructive
            </div>
            <button
              onClick={onResetProgress}
              className="px-4 py-2 rounded-sm flex items-center gap-2 text-sm border-2 border-red-800 text-red-300 hover:bg-red-900/30 italic"
              style={{ background: 'rgba(var(--surface-red, 41, 12, 12), 0.7)' }}
              aria-label="Begin Anew — permanently erases all local progress (a confirmation dialog will appear)"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> Begin Anew
            </button>
            <span className="ml-3 text-[10px] italic text-red-300/70">
              Erases all local progress. Confirmation required.
            </span>
          </div>
        </OrnatePanel>

        <AudioPanel />
        <ThemePanel
          currentTheme={playerState.theme || 'dark'}
          onSetTheme={onSetTheme}
          currentLocale={playerState.locale || 'en'}
          onSetLocale={onSetLocale}
          colorblind={!!playerState.colorblind}
          onToggleColorblind={onToggleColorblind}
        />
      </CollapsibleGroup>
    </div>
  );
}

export default HomeScreen;
