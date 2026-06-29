import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccountPanel } from './components/AccountPanel.jsx';
import { AudioInviteBanner } from './components/AudioInviteBanner.jsx';
import { ProfileChip } from './components/ProfileChip.jsx';
import RichContent from './components/RichContent.jsx';
import { RlsWarningBanner } from './components/RlsWarningBanner.jsx';
import { SignInButton } from './components/SignInButton.jsx';
import { MergeChooser } from './components/ui/MergeChooser.jsx';
import PromptModal from './components/ui/PromptModal.jsx';
import { useAppModals } from './hooks/useAppModals.js';
import { useAppSurfaces } from './hooks/useAppSurfaces.js';
import { useAuth } from './hooks/useAuth.js';
import { useDialogA11y } from './hooks/useDialogA11y.js';
import { useOAuthCallback } from './hooks/useOAuthCallback.js';
import { usePlayerState } from './hooks/usePlayerState.js';
import { useRlsProbe } from './hooks/useRlsProbe.js';
import { COURSE_SET_GATED, SEALED_GATED } from './router/screens.js';
import { setLocale, t } from './services/i18n.js';
import { checkImportSize } from './services/importLimits.js';
import { hasMeaningfulData, writeSnapshot } from './services/persistence.js';
import { isSealedTome, unsealTome } from './services/sealedTome.js';
import { clearSession, loadSession, SESSION_KIND, saveSession } from './services/sessionResume.js';
import { signOut } from './services/supabase.js';
import { lazyWithReload } from './utils/lazyWithReload.js';

const ExamMode = lazyWithReload(() => import('./features/study/ExamMode.jsx'));
// Polish: lazy-load DungeonExplore. It's the heaviest single component
// (sprite drawers, generateMap, biome maps) and is only used when the
// player enters a delve, so deferring its load shrinks the initial bundle.
const DungeonExplore = lazyWithReload(() => import('./components/dungeon/DungeonExplore.jsx'));

import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookMarked,
  BookOpen,
  Brain,
  Calendar,
  Castle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Coins,
  Compass,
  Copy,
  Crown,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileJson,
  Flame,
  FlaskConical,
  Gem,
  Gift,
  Hash,
  Heart,
  HelpCircle,
  Home,
  Keyboard,
  Library,
  Loader2,
  Lock,
  MessageSquare,
  Minus,
  Package,
  Play,
  Plus,
  RotateCcw,
  Scroll,
  ScrollText,
  Send,
  Settings,
  Share2,
  Shield,
  ShoppingBag,
  Skull,
  Sparkles,
  Star,
  Swords,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  Upload,
  User,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  armAutoSuspend,
  armOnFirstGesture,
  disarmAutoSuspend,
  getAudioSettings,
  getDefaultAudioSettings,
  playSfx,
  setAudioPersistErrorHandler,
  setBgmVolume,
  setMuted,
  setSfxVolume,
} from './audio/sound.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AchievementsModal } from './components/ui/AchievementsModal.jsx';
import { BLOOM_PALETTE, BloomBadge, DifficultyStars } from './components/ui/badges.jsx';
import { CollapsibleGroup } from './components/ui/CollapsibleGroup.jsx';
import { ConfirmModal } from './components/ui/ConfirmModal.jsx';
import { FilteredModeBanner } from './components/ui/FilteredModeBanner.jsx';
import { ModeCard } from './components/ui/ModeCard.jsx';
import { OrnatePanel } from './components/ui/OrnatePanel.jsx';
import { RecordTile } from './components/ui/RecordTile.jsx';
import { ResetConfirmModal } from './components/ui/ResetConfirmModal.jsx';
import ShortcutHelpModal from './components/ui/ShortcutHelpModal.jsx';
import { TitlesModal } from './components/ui/TitlesModal.jsx';
import TutorialPanel from './features/tutorial/TutorialPanel.jsx';
import WelcomeModal from './features/tutorial/WelcomeModal.jsx';
import { ACHIEVEMENTS } from './game/achievements.js';
import { BESTIARY_ENTRIES } from './game/bestiary.js';
import { DEFAULT_STATE } from './game/defaultState.js';
import {
  BOSS_ORDER,
  BOSS_TYPES,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  isDifficultyUnlocked,
  rollBoss,
} from './game/difficulty.js';
import { findItem, ITEM_CATEGORIES, ITEMS, pickShopStock, RECIPES, sanctumAtCap, sanctumCount } from './game/items.js';
import {
  COUNTER_ACTIONS,
  currentWeekStartStr,
  DAILY_QUEST_POOL,
  formatStoryAction,
  getCounterValue,
  pickDailyQuests,
  pickWeeklyQuests,
  STORY_CHAINS,
  WEEKLY_QUEST_POOL,
} from './game/quests.js';
import { getTitle, SPECIAL_TITLES, TITLES, xpForLevel } from './game/titles.js';
import {
  blankTomeProgress,
  decodeTomeShareCode,
  encodeTomeShareCode,
  formatDuration,
  generateTomeId,
  normalizeTomeData,
  shuffleArray,
  summarizeRunHistory,
} from './game/tome.js';
import { migrateTutorialIndex, snapshotBaselines, TUTORIAL_STEPS, tutorialAutoConditionMet } from './game/tutorial.js';
import { computeNextClaim, DAILY_REWARDS, dayDiff, evaluateClaim, todayDateStr } from './services/devotion.js';
import { computeExamPace } from './services/examPace.js';
import {
  computeExamPrediction,
  PREDICTION_HIGH_COVERAGE,
  PREDICTION_MEDIUM_COVERAGE,
} from './services/examPrediction.js';
import { computeMilestones, computeRetentionCurve } from './services/forgettingCurve.js';
import { notificationPermission, showStudyReminder } from './services/notifications.js';
import { getOracleEndpoint, gradeAnswer, isOracleConfigured, ORACLE_MODEL } from './services/oracleGrader.js';
import { findPet, PET_LEVEL_XP, PET_MAX_LEVEL, PETS, petLevelFromXp } from './services/pets.js';
import { findSpell, SPELLS } from './services/spells.js';
import { dueCount, filterDue, SRS_RATINGS, scheduleCard, sortByDueness } from './services/srs.js';
import { pickWeakestDomain, WEAK_DOMAIN_ACCURACY_THRESHOLD, WEAK_DOMAIN_MIN_SAMPLE } from './services/weakDomain.js';

const LibraryScreen = lazyWithReload(() => import('./features/library/LibraryScreen.jsx'));

import TomeNotes from './components/TomeNotes.jsx';
import ImportCodeModal from './features/library/ImportCodeModal.jsx';
import ImportDeckModal from './features/library/ImportDeckModal.jsx';
import MetadataEditModal from './features/library/MetadataEditModal.jsx';
import OcclusionAuthor from './features/library/OcclusionAuthor.jsx';
import PasteTomeModal from './features/library/PasteTomeModal.jsx';
import SealedTomeGate from './features/library/SealedTomeGate.jsx';
import ShareTomeModal from './features/library/ShareTomeModal.jsx';
import TomeEditor from './features/library/TomeEditor.jsx';
import { STARTER_DECKS } from './game/starterDecks.js';
import { deckTextToTome } from './services/deckImport.js';
import { applyTagToTomes } from './services/libraryBulk.js';

const RunHistoryScreen = lazyWithReload(() => import('./features/progression/RunHistoryScreen.jsx'));
const ShopScreen = lazyWithReload(() => import('./features/progression/ShopScreen.jsx'));
const InventoryScreen = lazyWithReload(() => import('./features/progression/InventoryScreen.jsx'));
const BestiaryScreen = lazyWithReload(() => import('./features/progression/BestiaryScreen.jsx'));
const StableScreen = lazyWithReload(() => import('./features/progression/StableScreen.jsx'));
const SpellbookScreen = lazyWithReload(() => import('./features/progression/SpellbookScreen.jsx'));
const CalendarScreen = lazyWithReload(() => import('./features/progression/CalendarScreen.jsx'));
const AscensionScreen = lazyWithReload(() => import('./features/progression/AscensionScreen.jsx'));
const CraftingScreen = lazyWithReload(() => import('./features/progression/CraftingScreen.jsx'));
const ScholarsLedger = lazyWithReload(() => import('./features/progression/ScholarsLedger.jsx'));
const QuestBoard = lazyWithReload(() => import('./features/quests/QuestBoard.jsx'));

import HomeScreen from './features/home/HomeScreen.jsx';

const FlashcardsMode = lazyWithReload(() => import('./features/study/FlashcardsMode.jsx'));
const QuizMode = lazyWithReload(() => import('./features/study/QuizMode.jsx'));
const LabMode = lazyWithReload(() => import('./features/study/LabMode.jsx'));
const ChatMode = lazyWithReload(() => import('./features/study/ChatMode.jsx'));
const MistakeVault = lazyWithReload(() => import('./features/study/MistakeVault.jsx'));
const DomainStudyScreen = lazyWithReload(() => import('./features/study/DomainStudyScreen.jsx'));

import { usePlayerActions } from './features/player/usePlayerActions.js';
import { useHashRoute } from './router/useHashRoute.js';

// PHASE-41 41B: screens that consume decrypted tome content. When the active
// tome is sealed-but-locked, these render the SealedTomeGate (unlock prompt)
// instead of their content; every other screen stays reachable while locked.

// Phase 32a QA #2: auto-route to an in-progress study session on mount so a
// mid-quiz refresh resumes the user where they were, not at Hearth. Order
// matters: timed exam (most urgent — deadline is ticking) wins over
// quiz/flashcards. An exam session only counts if its deadline is still in the
// future; quiz/flashcards count if their index is past the first question
// (saved index > 0 means meaningful progress). PHASE-39 39G: extracted to
// module scope so useHashRoute can seed the initial screen (and so a live exam
// keeps overriding the hash on reload).
function computeInitialScreen() {
  const exam = loadSession(SESSION_KIND.EXAM);
  if (exam && typeof exam.deadlineMs === 'number' && exam.deadlineMs > Date.now()) {
    return 'practiceExam';
  }
  const quiz = loadSession(SESSION_KIND.QUIZ);
  if (quiz && typeof quiz.index === 'number' && quiz.index > 0) {
    return 'quiz';
  }
  const flash = loadSession(SESSION_KIND.FLASHCARDS);
  if (flash && typeof flash.index === 'number' && flash.index > 0) {
    return 'flashcards';
  }
  return 'home';
}

export default function DungeonScholarApp() {
  // PHASE-39 39G: hash router. Keeps the [screen, setScreen] shape so every
  // setScreen call site + screen-keyed effect is untouched; adds Back/Forward
  // navigation, refresh-keeps-screen, and #/tome/<id> deep links.
  const [screen, setScreen, pendingTomeId, clearPendingTome] = useHashRoute(computeInitialScreen);
  const { user } = useAuth();
  const [playerState, setPlayerState, sync] = usePlayerState(DEFAULT_STATE, user);
  const [notification, setNotification] = useState(null);
  // M11 (18C): after sign-in, probe whether other users' saves rows are readable
  // (RLS off / mis-policied). Read-only, so StrictMode double-invoke is harmless.
  const { rlsExposed, setRlsExposed } = useRlsProbe(user);
  // Phase 33c QA P3: pending in-app confirmation (replaces window.confirm
  // which was unreliable — headless QA tools auto-dismissed it, making the
  // Trial-of-Hours abandon guard look silent). When non-null, renders an
  // in-DOM alertdialog; user resolves via Abandon (calls .onConfirm) or
  // Keep going (just clears the state).
  const { open: modalOpen, openModal, closeModal } = useAppModals();
  // Per-surface open/close + filter cluster — extracted to useAppSurfaces.
  const {
    pendingConfirm,
    setPendingConfirm,
    tutorialOpenedSurface,
    setTutorialOpenedSurface,
    shareTomeId,
    setShareTomeId,
    editMetadataTomeId,
    setEditMetadataTomeId,
    editContentTomeId,
    setEditContentTomeId,
    notesTome,
    setNotesTome,
    unsealedTomes,
    setUnsealedTomes,
    domainFilter,
    setDomainFilter,
    reviewMode,
    setReviewMode,
  } = useAppSurfaces();
  const fileInputRef = useRef(null);

  // Consume OAuth ?code=... on mount (returns false if no callback in URL).
  useOAuthCallback();

  // Phase 21: prime the audio context on first user gesture so BGM/SFX
  // don't fail silently due to browser auto-play policies.
  useEffect(() => {
    armOnFirstGesture();
    armAutoSuspend();
    return () => disarmAutoSuspend();
  }, []);

  // S1: best-effort local study reminder once the library has loaded, only if
  // the user already granted permission via the Account panel opt-in.
  const studyRemindedRef = useRef(false);
  useEffect(() => {
    if (studyRemindedRef.current) return;
    if (notificationPermission() !== 'granted') return;
    const lib = playerState.library || [];
    if (lib.length === 0) return;
    studyRemindedRef.current = true;
    const due = lib.reduce((sum, t) => sum + dueCount(t.progress?.cardProgress || {}, t.data?.flashcards || []), 0);
    showStudyReminder({ dueCount: due });
  }, [playerState.library]);

  // Phase 34b QA P10: apply theme to the root element. Re-evaluates on
  // explicit preference change AND on OS preference change (when 'system').
  useEffect(() => {
    const apply = () => {
      const pref = playerState.theme || 'dark';
      let effective = pref;
      if (pref === 'system') {
        const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
        effective = prefersLight ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', effective);
    };
    apply();
    if (playerState.theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => apply();
    try {
      mq.addEventListener('change', onChange);
    } catch {
      mq.addListener?.(onChange);
    }
    return () => {
      try {
        mq.removeEventListener('change', onChange);
      } catch {
        mq.removeListener?.(onChange);
      }
    };
  }, [playerState.theme]);

  // S7 i18n: apply the saved UI language on load and whenever it changes.
  // setLocale is a module singleton; this keeps it in sync with playerState.
  useEffect(() => {
    setLocale(playerState.locale || 'en');
  }, [playerState.locale]);

  // CVD: reflect the colorblind-safe palette opt-in onto the root element so
  // analytics surfaces can branch their accuracy scale.
  useEffect(() => {
    document.documentElement.setAttribute('data-cvd', playerState.colorblind ? 'true' : 'false');
  }, [playerState.colorblind]);

  // 25e2: Clear the Domain Study filter whenever the player navigates away
  // from Quiz/Flashcards. The filter is a per-launch decision, not sticky
  // state — re-entering Quiz from Home should give an unfiltered deck.
  // 26g: same lifecycle for reviewMode — only valid while inside
  // Flashcards.
  useEffect(() => {
    if (screen !== 'quiz' && screen !== 'flashcards') {
      setDomainFilter(null);
    }
    if (screen !== 'flashcards') {
      setReviewMode(false);
    }
  }, [screen]);

  // Show welcome modal only on a genuine first launch. Three guards:
  //  1. Ref short-circuit so it never fires twice per session (StrictMode
  //     double-mount + re-runs when deps change).
  //  2. If tutorial state is set OR there is any meaningful saved progress,
  //     bail immediately — the user has been here before.
  //  3. Otherwise wait ~1s for auth + cloud sync to settle before declaring
  //     "new user". This fixes the Phase 30 QA #3 case where a signed-in
  //     returning user briefly renders with the default state (before the
  //     cloud pull lands) and the old `[]`-deps effect already triggered.
  const welcomeShownRef = useRef(false);
  useEffect(() => {
    if (welcomeShownRef.current) return;
    if (playerState.tutorialStarted || playerState.tutorialCompleted) {
      welcomeShownRef.current = true;
      return;
    }
    if (hasMeaningfulData(playerState)) {
      welcomeShownRef.current = true;
      return;
    }
    const id = setTimeout(() => {
      if (welcomeShownRef.current) return;
      welcomeShownRef.current = true;
      openModal('welcome');
    }, 1000);
    return () => clearTimeout(id);
  }, [
    playerState.tutorialStarted,
    playerState.tutorialCompleted,
    playerState.level,
    playerState.totalXp,
    playerState.library?.length,
  ]);

  // Tutorial step advancement helpers
  const advanceTutorial = (currentId) => {
    // PHASE-17 17C: compute the transition from current render state so the
    // toasts fire from the handler, not inside the (pure) updater.
    const curIdx = playerState.tutorialStepIndex;
    const curStep = TUTORIAL_STEPS[curIdx];
    const willAdvance = !playerState.tutorialCompleted && curStep && curStep.id === currentId;
    const willComplete = willAdvance && curIdx + 1 >= TUTORIAL_STEPS.length;
    setPlayerState((prev) => {
      if (prev.tutorialCompleted) return prev;
      const currentIdx = prev.tutorialStepIndex;
      const currentStep = TUTORIAL_STEPS[currentIdx];
      // Only advance if the requested step matches current
      if (!currentStep || currentStep.id !== currentId) return prev;
      const xp = currentStep.xp || 0;
      const nextIdx = currentIdx + 1;
      const isComplete = nextIdx >= TUTORIAL_STEPS.length;
      const next = {
        ...prev,
        xp: prev.xp + xp,
        totalXp: prev.totalXp + xp,
        tutorialStepIndex: isComplete ? currentIdx : nextIdx,
        tutorialCompleted: isComplete,
        // Snapshot baselines for the next step's auto-condition.
        tutorialBaselines: snapshotBaselines(prev),
      };
      if (isComplete && !next.unlockedTitles.includes('initiated')) {
        next.unlockedTitles = [...next.unlockedTitles, 'initiated']; // toast via the central titles effect (17C)
      }
      return next;
    });
    if (willComplete) {
      setTimeout(() => showNotif('Tutorial Complete! Welcome, brave scholar.', 'levelup'), 400);
    } else if (willAdvance) {
      setTimeout(() => showNotif(`+${curStep.xp || 0} XP — ${curStep.title}`, 'xp'), 100);
    }
  };

  const skipTutorial = () => {
    setPlayerState((prev) => ({ ...prev, tutorialCompleted: true, tutorialStarted: true }));
    closeModal('welcome');
    showNotif('Tutorial skipped — thy path is thine own', 'info');
  };

  const startTutorial = () => {
    setPlayerState((prev) => ({
      ...prev,
      tutorialStarted: true,
      tutorialBaselines: snapshotBaselines(prev),
    }));
    closeModal('welcome');
  };

  const toggleTutorialPanel = () => {
    setPlayerState((prev) => ({ ...prev, tutorialPanelCollapsed: !prev.tutorialPanelCollapsed }));
  };

  // Phase 38a/39c/43a/44c: showNotif with optional onClick (deep-links),
  // timeoutMs, and hover/focus pause. 43a fixes the multi-toast clobber
  // (single shared timer). 44c stores the timeoutMs on the notification
  // itself so the toast render can rearm the timer on hover-out / blur
  // — effectively pausing the auto-dismiss while the user is reading or
  // about to click an undo affordance.
  const notifTimeoutRef = useRef(null);
  const showNotif = (msg, type = 'info', onClick = null, timeoutMs = 3000) => {
    if (notifTimeoutRef.current) {
      clearTimeout(notifTimeoutRef.current);
      notifTimeoutRef.current = null;
    }
    setNotification({ msg, type, onClick, timeoutMs });
    notifTimeoutRef.current = setTimeout(() => {
      setNotification(null);
      notifTimeoutRef.current = null;
    }, timeoutMs);
  };

  // Phase 39F: pure state-mutating player actions + cross-library memos now
  // live in usePlayerActions. They reference only playerState/setPlayerState/
  // showNotif/user, imported game data/services, and each other — so they
  // hydrate the same identifiers App used to declare inline.
  const {
    totalCardsAcrossLib,
    totalLabsAttemptedAcrossLib,
    totalOracleAcrossLib,
    totalRunsAcrossLib,
    totalQuizAnsweredAcrossLib,
    totalDungeonRunsAttempted,
    updateProgress,
    updateTomeProgress,
    updateCardProgress,
    setCardSuspended,
    setTomeExamDate,
    awardXP,
    awardGold,
    purchaseItem,
    equipItem,
    unequipSlot,
    equipPet,
    unequipPet,
    awardPetXp,
    claimDailyReward,
    canAscend,
    ascend,
    equipSpell,
    unequipSpell,
    equipPotion,
    unequipPotion,
    recordBestiary,
    recordSpellCast,
    recordHarvest,
    craftRecipe,
    giveItem,
    consumeItem,
    checkAchievement,
    unlockSpecialTitle,
    recordAnswer,
    removeFromVault,
    trackDungeonAttempt,
    trackModeUseDaily,
    dailyQuestStatus,
    claimQuest,
    claimAllQuests,
    weeklyQuestStatus,
    claimWeeklyQuest,
    claimAllWeeklyQuests,
    storyChainStatus,
    claimableStoryStepCount,
    claimStoryStep,
    claimableQuestCount,
    trackModeUse,
    addTomeToLibrary,
    deleteTome,
    renameTome,
    duplicateTome,
    updateTomeMetadata,
    updateTomeNotes,
  } = usePlayerActions({ playerState, setPlayerState, showNotif, user });

  // Auto-completion checks: any time relevant state changes, check if current
  // tutorial step's auto-condition is met *relative to the baseline captured
  // when this step began*, and advance.

  useEffect(() => {
    if (playerState.tutorialCompleted || !playerState.tutorialStarted) return;
    const step = TUTORIAL_STEPS[playerState.tutorialStepIndex];
    if (!step || !step.autoComplete) return;

    // Absolute checks: a returning user who already has a tome / studied card /
    // beaten the dungeon should not have to redo it. The previous "delta from
    // baseline" approach broke when users took an action that didn't change
    // the net count (e.g., delete-then-re-add a tome to satisfy step 3).
    const met = tutorialAutoConditionMet(step.autoCondition, {
      playerState,
      totalCardsAcrossLib,
      totalQuizAnsweredAcrossLib,
      totalLabsAttemptedAcrossLib,
      totalOracleAcrossLib,
    });
    if (met) advanceTutorial(step.id);
  }, [
    playerState.tutorialStarted,
    playerState.tutorialCompleted,
    playerState.tutorialStepIndex,
    playerState.library.length,
    playerState.dungeonAttempts,
    playerState.tutorialVisits,
    totalCardsAcrossLib,
    totalQuizAnsweredAcrossLib,
    totalLabsAttemptedAcrossLib,
    totalOracleAcrossLib,
    totalRunsAcrossLib,
  ]);

  // Tutorial action-button dismissal tracking. When the player closes the
  // surface they opened from a tutorial action button, flip the matching
  // tutorialVisits flag — credit on engagement, not on click. The
  // autoCondition useEffect above watches tutorialVisits and advances.
  useEffect(() => {
    if (!tutorialOpenedSurface) return undefined;
    const stillOpen =
      (tutorialOpenedSurface === 'library' && screen === 'library') ||
      (tutorialOpenedSurface === 'vault' && screen === 'vault') ||
      (tutorialOpenedSurface === 'quests' && screen === 'quests') ||
      (tutorialOpenedSurface === 'achievements' && modalOpen.achievements) ||
      (tutorialOpenedSurface === 'titles' && modalOpen.titles) ||
      (tutorialOpenedSurface === 'bestiary' && screen === 'bestiary') ||
      (tutorialOpenedSurface === 'stable' && screen === 'stable') ||
      (tutorialOpenedSurface === 'spellbook' && screen === 'spellbook') ||
      (tutorialOpenedSurface === 'calendar' && screen === 'calendar') ||
      (tutorialOpenedSurface === 'crafting' && screen === 'crafting') ||
      (tutorialOpenedSurface === 'ascension' && screen === 'ascension');
    if (!stillOpen) {
      const key = tutorialOpenedSurface;
      setPlayerState((prev) => ({
        ...prev,
        tutorialVisits: { ...(prev.tutorialVisits || {}), [key]: true },
      }));
      setTutorialOpenedSurface(null);
    }
  }, [screen, modalOpen.achievements, modalOpen.titles, tutorialOpenedSurface]);

  // Active tome convenience accessor
  const activeTome = useMemo(() => {
    if (!playerState.activeTomeId) return null;
    const entry = playerState.library.find((t) => t.id === playerState.activeTomeId);
    return entry || null;
  }, [playerState.activeTomeId, playerState.library]);

  // PHASE-41 41B: a sealed active tome only exposes content once unlocked this
  // session. `courseSet` resolves to the in-memory decrypted object (or null
  // while locked); `sealedLocked` gates the content screens below.
  const activeSealed = !!(activeTome && isSealedTome(activeTome.data));
  const courseSet = activeTome ? (activeSealed ? unsealedTomes[activeTome.id] || null : activeTome.data) : null;
  const sealedLocked = activeSealed && !unsealedTomes[activeTome.id];
  const tomeProgress = activeTome?.progress || blankTomeProgress();

  // Pre-shuffled activity decks. Reshuffled ONLY when the active tome changes
  // (or on hard refresh). Keeps card/quiz order stable across navigation and
  // across cloud-sync echoes that re-create the courseSet reference.
  const [shuffledActivities, setShuffledActivities] = useState({ flashcards: [], quiz: [] });
  useEffect(() => {
    if (!courseSet) {
      setShuffledActivities({ flashcards: [], quiz: [] });
      return;
    }
    setShuffledActivities({
      flashcards: shuffleArray(courseSet.flashcards || []),
      quiz: shuffleArray(courseSet.quiz || []),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.activeTomeId]);

  // M10 (17F): surface a silent local-save failure (quota / private mode) once
  // per session. sync.localSaveFailed is sticky, so this effect fires exactly once.
  useEffect(() => {
    if (!sync.localSaveFailed) return;
    showNotif(
      'Thy progress cannot be saved on this device — sign in for cloud backup, or export thy journal.',
      'error',
      null,
      8000,
    );
  }, [sync.localSaveFailed]);

  // M10 (17F): route audio-settings persistence failures through the same toast.
  useEffect(() => {
    setAudioPersistErrorHandler(() => showNotif('Audio settings cannot be saved on this device.', 'info'));
  }, []);

  // In-app keyboard-shortcut help: `?` opens the ShortcutHelpModal so the
  // per-mode bindings are discoverable. Skip when typing in a field so we
  // don't hijack a literal '?' the user is entering.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '?') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tg = e.target;
      const tag = tg && tg.tagName ? tg.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (tg && tg.isContentEditable)) return;
      e.preventDefault();
      openModal('shortcuts');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openModal]);

  // Phase 45d: window-level Ctrl+Z / Cmd+Z global hotkey. Triggers the
  // active notification's onClick (Undo for vault vanquish) when one is
  // showing. Keyboard-only users get a reliable undo without having to
  // mouse to the toast within its visible window. Skip when focus is in
  // a text input so we don't hijack native undo in textareas/contentedit.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.key === 'z' || e.key === 'Z')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.shiftKey || e.altKey) return; // leave Ctrl+Shift+Z for redo
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) return;
      if (!notification || typeof notification.onClick !== 'function') return;
      e.preventDefault();
      try {
        notification.onClick();
      } catch {
        /* ignore */
      }
      if (notifTimeoutRef.current) {
        clearTimeout(notifTimeoutRef.current);
        notifTimeoutRef.current = null;
      }
      setNotification(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notification]);

  // PHASE-17 17C — achievement/title/level toasts derive from state transitions
  // so the setState updaters above stay pure. StrictMode double-invokes updaters
  // in dev (and concurrent rendering may replay them in prod); a toast fired
  // inside an updater duplicates. Mount-initialized "seen" refs suppress toast
  // spam for already-unlocked entries on a loaded save.
  const seenAchievementsRef = useRef(null);
  useEffect(() => {
    const current = playerState.achievements || [];
    if (seenAchievementsRef.current === null) {
      seenAchievementsRef.current = new Set(current); // mount: no toast spam for loaded saves
      return;
    }
    for (const id of current) {
      if (seenAchievementsRef.current.has(id)) continue;
      seenAchievementsRef.current.add(id);
      const ach = ACHIEVEMENTS.find((a) => a.id === id);
      // No "(+gold)" suffix: only checkAchievement grants gold; the 14 other
      // grant paths (recordAnswer/trackModeUse/addTomeToLibrary/updateProgress
      // milestones) award none, so a fixed suffix would be a false claim. The
      // gold that IS granted still updates the visible counter.
      if (ach) showNotif(`Achievement Unlocked: ${ach.name}`, 'achievement', () => openModal('achievements'));
    }
  }, [playerState.achievements]);

  const seenTitlesRef = useRef(null);
  useEffect(() => {
    const current = playerState.unlockedTitles || [];
    if (seenTitlesRef.current === null) {
      seenTitlesRef.current = new Set(current);
      return;
    }
    for (const id of current) {
      if (seenTitlesRef.current.has(id)) continue;
      seenTitlesRef.current.add(id);
      const title = SPECIAL_TITLES[id];
      if (title) showNotif(`Title Unlocked: ${title.name}`, 'achievement', () => openModal('titles'));
    }
  }, [playerState.unlockedTitles]);

  const prevLevelRef = useRef(playerState.level);
  useEffect(() => {
    if (playerState.level > prevLevelRef.current) {
      showNotif(`Level Up! You are now Level ${playerState.level}`, 'levelup');
    }
    prevLevelRef.current = playerState.level;
  }, [playerState.level]);

  // === Daily Quest System ===
  // Refresh quests whenever the date changes (or on first load).
  useEffect(() => {
    const today = todayDateStr();
    if (!playerState.dailyQuests || playerState.dailyQuests.date !== today) {
      setPlayerState((prev) => {
        const picked = pickDailyQuests(today, 3);
        return {
          ...prev,
          dailyQuests: {
            date: today,
            quests: picked.map((q) => ({
              id: q.id,
              baseline: getCounterValue(prev, q.counter),
              claimed: false,
            })),
          },
          modesUsedToday: [],
          maxStreakToday: 0,
        };
      });
    }
  }, [playerState.dailyQuests?.date]);

  // === Weekly Quest System ===
  // Refresh weekly quests whenever the week changes (Monday-based).
  useEffect(() => {
    const weekStart = currentWeekStartStr();
    if (!playerState.weeklyQuests || playerState.weeklyQuests.weekStart !== weekStart) {
      setPlayerState((prev) => {
        const picked = pickWeeklyQuests(weekStart, 3);
        return {
          ...prev,
          weeklyQuests: {
            weekStart,
            quests: picked.map((q) => ({
              id: q.id,
              baseline: getCounterValue(prev, q.counter),
              claimed: false,
            })),
          },
          maxStreakWeek: 0,
        };
      });
    }
  }, [playerState.weeklyQuests?.weekStart]);

  // === Story Quest Chain System ===
  // Initialize storyProgress for any chain not yet seen, snapshotting current
  // counter values as the baseline so progress measures NEW activity.
  // Mount-only: depending on playerState.storyProgress causes a feedback loop
  // when cloud sync replaces state with a version that lacks the field.
  // The defensive sp-init in claimStoryStep handles the missing-entry case.
  useEffect(() => {
    setPlayerState((prev) => {
      let changed = false;
      const next = { ...(prev.storyProgress || {}) };
      STORY_CHAINS.forEach((chain) => {
        if (!next[chain.id]) {
          const firstStep = chain.steps[0];
          next[chain.id] = {
            stepIndex: 0,
            baseline: getCounterValue(prev, firstStep.counter),
            completed: false,
            claimedSteps: [],
          };
          changed = true;
        }
      });
      return changed ? { ...prev, storyProgress: next } : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchActiveTome = (tomeId) => {
    setPlayerState((prev) => ({
      ...prev,
      activeTomeId: tomeId,
      library: prev.library.map((t) => (t.id === tomeId ? { ...t, lastOpened: Date.now() } : t)),
    }));
    setScreen('home');
  };

  // PHASE-39 39G: consume a `#/tome/<id>` deep link — activate the tome WITHOUT
  // switchActiveTome's forced setScreen('home'), so a `#/tome/<id>/<screen>` link
  // keeps the screen the hash asked for (already set by useHashRoute's init).
  // Idempotent under StrictMode double-invoke: the second run sees pendingTomeId
  // null (cleared below), and re-activating the same id is a no-op state write.
  useEffect(() => {
    if (!pendingTomeId) return;
    const found = playerState.library.some((t) => t.id === pendingTomeId);
    if (found) {
      setPlayerState((prev) => ({
        ...prev,
        activeTomeId: pendingTomeId,
        library: prev.library.map((t) => (t.id === pendingTomeId ? { ...t, lastOpened: Date.now() } : t)),
      }));
    } else {
      showNotif('That tome is not in thy library.', 'error');
    }
    clearPendingTome(); // also canonicalizes the URL to #/<screen> via replaceState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTomeId]);

  // PHASE-39 39G: the six courseSet-gated screens render a blank main area
  // without an active tome. Deep links now make them reachable by URL, so bounce
  // to home (with a nudge) when no tome is loaded.
  useEffect(() => {
    // PHASE-41 41B: a sealed-but-locked tome also has courseSet == null, but it
    // should show the SealedTomeGate (an unlock prompt) rather than bounce home.
    if (COURSE_SET_GATED.includes(screen) && courseSet == null && !sealedLocked) {
      setScreen('home');
      showNotif('Choose a tome first.', 'info');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, courseSet, sealedLocked]);

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeCheck = checkImportSize(file.size); // PHASE-40 40A (L14): reject before reading
    if (!sizeCheck.ok) {
      showNotif(sizeCheck.message, 'error');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        // PHASE-41 41B: a sealed-tome envelope has metadata but no top-level
        // `flashcards` array, so accept it via the sealed predicate alongside
        // the plain-tome shape check.
        if (!isSealedTome(data) && (!data.metadata || !data.flashcards)) {
          showNotif('Invalid tome format', 'error');
          return;
        }
        // Phase 30c QA #6: addTomeToLibrary now returns false on empty
        // content — only celebrate when it actually inscribed.
        if (addTomeToLibrary(data)) {
          showNotif(`Tome inscribed: ${data.metadata.title}`, 'success');
        }
      } catch (err) {
        showNotif('Failed to decipher the tome', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePasteImport = (text) => {
    const sizeCheck = checkImportSize(text.length); // PHASE-40 40A (L14): reject before JSON.parse
    if (!sizeCheck.ok) {
      showNotif(sizeCheck.message, 'error');
      return false;
    }
    try {
      // Strip common markdown code fences if present
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      }
      const data = JSON.parse(cleaned);
      // PHASE-41 41B: accept a sealed-tome envelope (metadata + no top-level
      // flashcards) via the sealed predicate alongside the plain-tome shape.
      if (!isSealedTome(data) && (!data.metadata || !data.flashcards)) {
        showNotif('Invalid tome format — needs metadata and flashcards', 'error');
        return false;
      }
      if (!addTomeToLibrary(data)) return false;
      showNotif(`Tome inscribed: ${data.metadata.title}`, 'success');
      return true;
    } catch (err) {
      showNotif('Could not parse the pasted text as JSON', 'error');
      return false;
    }
  };

  // Item: import a deck from CSV / TSV / Quizlet export text. Converts to a
  // tome and routes through the same addTomeToLibrary path as every import.
  const handleDeckImport = (text) => {
    const sizeCheck = checkImportSize(text.length);
    if (!sizeCheck.ok) {
      showNotif(sizeCheck.message, 'error');
      return false;
    }
    const res = deckTextToTome(text);
    if (!res.ok) {
      showNotif(res.error, 'error');
      return false;
    }
    if (!addTomeToLibrary(res.tome)) return false;
    showNotif(`Imported ${res.count} card${res.count === 1 ? '' : 's'} into a new tome`, 'success');
    return true;
  };

  // Item: create a tome from an authored image-occlusion card.
  const handleOcclusionCreate = (tome) => {
    if (!addTomeToLibrary(tome)) return false;
    showNotif(`Occlusion tome inscribed: ${tome.metadata.title}`, 'success');
    return true;
  };

  // I3 (Web Share Target): when the OS share sheet sends a tome to the
  // installed PWA, the service worker stashes the payload and redirects here
  // with ?share-target=1. Pull it from the cache and run it through the same
  // paste-import path, then strip the query so a refresh won't re-import.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('share-target') !== '1') return;
    (async () => {
      try {
        if (typeof caches !== 'undefined') {
          const cache = await caches.open('ds-share-target');
          const res = await cache.match('shared-tome');
          if (res) {
            const text = await res.text();
            await cache.delete('shared-tome');
            if (text && text.trim() && handlePasteImport(text)) {
              setScreen('library');
            }
          }
        }
      } catch {
        /* ignore — nothing to import */
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('share-target');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShareCodeImport = (code) => {
    const sizeCheck = checkImportSize(code.length); // PHASE-40 40A (L14): reject before atob/decode
    if (!sizeCheck.ok) {
      showNotif(sizeCheck.message, 'error');
      return false;
    }
    const data = decodeTomeShareCode(code);
    if (!data) {
      showNotif('Invalid share code — must start with TOME-V1:', 'error');
      return false;
    }
    // PHASE-41 41B: accept a sealed-tome envelope alongside the plain shape.
    if (!isSealedTome(data) && (!data.metadata || !data.flashcards)) {
      showNotif('Share code decoded but tome is malformed', 'error');
      return false;
    }
    if (!addTomeToLibrary(data)) return false;
    showNotif(`Tome received: ${data.metadata.title}`, 'success');
    return true;
  };

  // PHASE-41 41B: unlock a sealed tome by deriving its key from the proctor
  // passphrase and decrypting in memory. The decrypted object lives ONLY in
  // unsealedTomes (never playerState), so it never persists. Failures are
  // returned as a value — NEVER thrown across the UI boundary — so the gate can
  // render a friendly error without an uncaught-rejection crash.
  const unlockSealedTome = async (tomeId, passphrase) => {
    const entry = playerState.library.find((t) => t.id === tomeId);
    if (!entry || !isSealedTome(entry.data)) return { ok: false, reason: 'not-sealed' };
    try {
      const tome = await unsealTome(entry.data, passphrase);
      setUnsealedTomes((prev) => ({ ...prev, [tomeId]: tome }));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  };

  const lockSealedTome = (tomeId) =>
    setUnsealedTomes((prev) => {
      const n = { ...prev };
      delete n[tomeId];
      return n;
    });

  // PHASE-41 41B: prune decrypted entries for tomes no longer in the library
  // (deleted/banished), so a deleted sealed tome can't linger unlocked in memory.
  useEffect(() => {
    setUnsealedTomes((prev) => {
      const ids = new Set(playerState.library.map((t) => t.id));
      const keys = Object.keys(prev);
      if (keys.every((k) => ids.has(k))) return prev; // no stale keys
      const next = {};
      for (const k of keys) if (ids.has(k)) next[k] = prev[k];
      return next;
    });
  }, [playerState.library]);

  const resetProgress = () => {
    openModal('resetConfirm');
  };

  const confirmReset = () => {
    // I1: snapshot the pre-reset state so the wipe is undoable for one step
    // (works signed-out via the Undo toast / Ctrl+Z hotkey, no cloud needed).
    const preReset = playerState;
    writeSnapshot(preReset, { force: true, reason: 'pre-reset' });
    setPlayerState(DEFAULT_STATE);
    closeModal('resetConfirm');
    setTimeout(
      () =>
        showNotif(
          'Saga reset — thy journey begins anew · Undo (Ctrl+Z)',
          'info',
          () => {
            setPlayerState(preReset);
            showNotif('Saga restored from snapshot', 'info', null, 1800);
          },
          8000,
        ),
      50,
    );
  };

  const currentTitle = getTitle(playerState.level, playerState.selectedTitle, playerState.unlockedTitles);
  const xpNeeded = xpForLevel(playerState.level);
  const xpPercent = (playerState.xp / xpNeeded) * 100;

  // Screen registry dispatch — collapses the former ~21-branch `screen === ...`
  // ladder into a single lookup keyed by the screen id (the canonical screen
  // list + gating live in router/screens.js). Each thunk returns exactly the
  // JSX its inline branch did, preserving its courseSet / sealedLocked guard.
  const screenViews = {
    home: () => (
      <HomeScreen
        courseSet={courseSet}
        tomeProgress={tomeProgress}
        setScreen={setScreen}
        trackModeUse={trackModeUse}
        onImport={() => fileInputRef.current?.click()}
        onPaste={() => openModal('paste')}
        onImportCode={() => openModal('importCode')}
        onImportDeck={() => openModal('importDeck')}
        onAuthorOcclusion={() => openModal('occlusionAuthor')}
        onShowPrompt={() => openModal('prompt')}
        playerState={playerState}
        signedIn={!!user}
        onResetProgress={resetProgress}
        onOpenLibrary={() => setScreen('library')}
        onShowAchievements={() => openModal('achievements')}
        onEnterReviews={() => {
          setReviewMode(true);
          trackModeUse('flashcards');
          setScreen('flashcards');
        }}
        onSetLocale={(loc) => {
          setLocale(loc);
          setPlayerState((prev) => ({ ...prev, locale: loc }));
        }}
        onToggleColorblind={(on) => setPlayerState((prev) => ({ ...prev, colorblind: !!on }))}
        onSetTheme={(t) => {
          // Phase 46h: every theme switch surfaces an Undo toast (Ctrl+Z
          // compatible — the global hotkey from 45d invokes the active
          // toast's onClick). Capturing prev.theme outside the updater keeps
          // the closure stable for the undo callback. PHASE-41 (QA16): Light
          // is now a FULL theme, so the old "panels stay dark" intro is gone.
          const prevTheme = playerState.theme || 'dark';
          if (prevTheme === t) return;
          setPlayerState((prev) => {
            const next = { ...prev, theme: t };
            if (t === 'light' && !prev.lightModeIntroShown) {
              next.lightModeIntroShown = true;
            }
            return next;
          });
          const labelOf = (id) => (id === 'light' ? 'Light' : id === 'system' ? 'Match System' : 'Dark');
          const introTail =
            t === 'light' && !playerState.lightModeIntroShown ? ' (parchment-light pages, panels, and text)' : '';
          setTimeout(
            () =>
              showNotif(
                `Theme: ${labelOf(t)}${introTail} · Undo (Ctrl+Z)`,
                'info',
                () => {
                  setPlayerState((prev) => ({ ...prev, theme: prevTheme }));
                  showNotif(`Theme reverted to ${labelOf(prevTheme)}`, 'info', null, 1800);
                },
                7000,
              ),
            50,
          );
        }}
        onRestartTutorial={() => {
          setPlayerState((prev) => ({
            ...prev,
            tutorialStepIndex: 0,
            tutorialCompleted: false,
            tutorialStarted: true,
            tutorialPanelCollapsed: false,
            tutorialBaselines: snapshotBaselines(prev),
          }));
          showNotif('Tutorial restarted', 'info');
        }}
      />
    ),
    library: () => (
      <LibraryScreen
        playerState={playerState}
        onSwitch={switchActiveTome}
        onDelete={deleteTome}
        onRename={renameTome}
        onDuplicate={duplicateTome}
        onShare={(id) => setShareTomeId(id)}
        onEditMetadata={(id) => setEditMetadataTomeId(id)}
        onEditContent={(id) => setEditContentTomeId(id)}
        onBulkTag={(ids, tag) =>
          setPlayerState((prev) => ({ ...prev, library: applyTagToTomes(prev.library, ids, tag) }))
        }
        starterDecks={STARTER_DECKS}
        onAddStarter={(data) => {
          addTomeToLibrary(data);
        }}
        onNotes={(tome) => setNotesTome(tome)}
        onTogglePin={(id) => {
          // Phase 38d round-3 suggestion: pin/unpin a tome so it floats
          // to the top of the Library — useful once a user has 5+ tomes
          // and the active-only badge isn't enough navigation.
          setPlayerState((prev) => ({
            ...prev,
            library: prev.library.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
          }));
        }}
        onImport={() => fileInputRef.current?.click()}
        onPaste={() => openModal('paste')}
        onImportCode={() => openModal('importCode')}
        onImportDeck={() => openModal('importDeck')}
        onAuthorOcclusion={() => openModal('occlusionAuthor')}
        onShowPrompt={() => openModal('prompt')}
        setScreen={setScreen}
        claimableQuestCount={claimableQuestCount}
      />
    ),
    quests: () => (
      <QuestBoard
        dailyQuests={dailyQuestStatus}
        dailyDate={playerState.dailyQuests?.date}
        onClaimDaily={claimQuest}
        onClaimAllDaily={claimAllQuests}
        weeklyQuests={weeklyQuestStatus}
        weekStart={playerState.weeklyQuests?.weekStart}
        onClaimWeekly={claimWeeklyQuest}
        onClaimAllWeekly={claimAllWeeklyQuests}
        storyChains={storyChainStatus}
        onClaimStoryStep={claimStoryStep}
      />
    ),
    inventory: () => (
      <InventoryScreen
        playerState={playerState}
        setScreen={setScreen}
        onEquip={equipItem}
        onUnequip={unequipSlot}
        onEquipPotion={equipPotion}
        onUnequipPotion={unequipPotion}
        onEquipSpell={equipSpell}
        onUnequipSpell={unequipSpell}
      />
    ),
    shop: () => <ShopScreen playerState={playerState} setScreen={setScreen} onPurchase={purchaseItem} />,
    crafting: () => <CraftingScreen playerState={playerState} setScreen={setScreen} onCraft={craftRecipe} />,
    bestiary: () => <BestiaryScreen playerState={playerState} setScreen={setScreen} />,
    stable: () => (
      <StableScreen playerState={playerState} setScreen={setScreen} onEquipPet={equipPet} onUnequipPet={unequipPet} />
    ),
    spellbook: () => (
      <SpellbookScreen
        playerState={playerState}
        setScreen={setScreen}
        onEquipSpell={equipSpell}
        onUnequipSpell={unequipSpell}
      />
    ),
    calendar: () => <CalendarScreen playerState={playerState} setScreen={setScreen} onClaim={claimDailyReward} />,
    ascension: () => <AscensionScreen playerState={playerState} setScreen={setScreen} onAscend={ascend} />,
    history: () => <RunHistoryScreen playerState={playerState} setScreen={setScreen} />,
    ledger: () => (
      <ScholarsLedger
        playerState={playerState}
        setScreen={setScreen}
        scholarName={user?.githubLogin || 'Scholar'}
        onSuspendCard={setCardSuspended}
        onEditTome={(id) => setEditContentTomeId(id)}
      />
    ),
    domainStudy: () =>
      !sealedLocked && (
        <DomainStudyScreen
          playerState={playerState}
          setScreen={setScreen}
          onSetExamDate={setTomeExamDate}
          onMarkVisited={() => {
            setPlayerState((prev) => {
              const visits = prev.tutorialVisits || {};
              if (visits.domain_study_visited) return prev;
              return { ...prev, tutorialVisits: { ...visits, domain_study_visited: true } };
            });
          }}
          onStudyDomain={(mode, domainName) => {
            setDomainFilter(domainName);
            if (mode === 'quiz') {
              trackModeUse('quiz');
              setScreen('quiz');
            } else if (mode === 'flashcards') {
              trackModeUse('flashcards');
              setScreen('flashcards');
            }
          }}
        />
      ),
    dungeon: () =>
      courseSet && (
        <DungeonExplore
          onExit={() => setScreen('home')}
          playerState={playerState}
          subject={courseSet?.metadata?.subject}
          courseSet={courseSet}
          tomeProgress={tomeProgress}
          awardXP={awardXP}
          awardGold={awardGold}
          recordAnswer={recordAnswer}
          checkAchievement={checkAchievement}
          unlockSpecialTitle={unlockSpecialTitle}
          updateProgress={updateProgress}
          updateTomeProgress={updateTomeProgress}
          trackDungeonAttempt={trackDungeonAttempt}
          onViewHistory={() => setScreen('history')}
          consumeItem={consumeItem}
          giveItem={giveItem}
          recordBestiary={recordBestiary}
          recordSpellCast={recordSpellCast}
          recordHarvest={recordHarvest}
          awardPetXp={awardPetXp}
          petCatalog={Object.values(PETS)}
          spellCatalog={Object.values(SPELLS)}
          itemCatalog={ITEMS}
          equipItem={equipItem}
          unequipSlot={unequipSlot}
          equipPet={equipPet}
          unequipPet={unequipPet}
          equipPotion={equipPotion}
          unequipPotion={unequipPotion}
          equipSpell={equipSpell}
          unequipSpell={unequipSpell}
        />
      ),
    flashcards: () =>
      courseSet && (
        <FlashcardsMode
          courseSet={courseSet}
          tomeId={playerState.activeTomeId}
          cards={shuffledActivities.flashcards}
          tomeProgress={tomeProgress}
          playerState={playerState}
          awardXP={awardXP}
          updateTomeProgress={updateTomeProgress}
          updateCardProgress={updateCardProgress}
          checkAchievement={checkAchievement}
          domainFilter={domainFilter}
          onExitFilter={() => {
            setDomainFilter(null);
            setScreen('domainStudy');
          }}
          reviewMode={reviewMode}
          onExitReviewMode={() => {
            setReviewMode(false);
            setScreen('home');
          }}
          onResumeNotify={(info) =>
            showNotif(`Resumed Scroll ${info.index + 1} of ${info.total}`, 'success', null, 1500)
          }
        />
      ),
    quiz: () =>
      courseSet && (
        <QuizMode
          courseSet={courseSet}
          tomeId={playerState.activeTomeId}
          questions={shuffledActivities.quiz}
          tomeProgress={tomeProgress}
          playerState={playerState}
          awardXP={awardXP}
          recordAnswer={recordAnswer}
          checkAchievement={checkAchievement}
          updateTomeProgress={updateTomeProgress}
          domainFilter={domainFilter}
          onExitFilter={() => {
            setDomainFilter(null);
            setScreen('domainStudy');
          }}
          onResumeNotify={(info) =>
            showNotif(
              `Resumed Riddle ${Math.min(info.progressCount + 1, info.total)} of ${info.total}${info.streak > 0 ? ` · Streak ${info.streak}` : ''}`,
              'success',
              null,
              1500,
            )
          }
          onGoToLibrary={() => setScreen('library')}
        />
      ),
    lab: () =>
      courseSet && (
        <LabMode
          courseSet={courseSet}
          tomeProgress={tomeProgress}
          playerState={playerState}
          awardXP={awardXP}
          recordAnswer={recordAnswer}
          updateTomeProgress={updateTomeProgress}
          checkAchievement={checkAchievement}
          onPendingConfirm={setPendingConfirm}
          onGoToLibrary={() => setScreen('library')}
        />
      ),
    chat: () =>
      courseSet && (
        <ChatMode
          courseSet={courseSet}
          tomeProgress={tomeProgress}
          updateTomeProgress={updateTomeProgress}
          checkAchievement={checkAchievement}
        />
      ),
    practiceExam: () =>
      courseSet && (
        <ExamMode
          courseSet={courseSet}
          tomeId={playerState.activeTomeId}
          tomeProgress={tomeProgress}
          updateTomeProgress={updateTomeProgress}
          awardXP={awardXP}
          onExit={() => setScreen('home')}
          onResumeNotify={(info) =>
            showNotif(
              `Resumed trial — Riddle ${info.currentIdx + 1} of ${info.total} · ${info.remainingLabel} left`,
              'success',
              null,
              1500,
            )
          }
        />
      ),
    vault: () =>
      !sealedLocked && (
        <MistakeVault
          courseSet={courseSet}
          tomeProgress={tomeProgress}
          playerState={playerState}
          onRemove={removeFromVault}
          checkAchievement={checkAchievement}
          unlockSpecialTitle={unlockSpecialTitle}
          awardXP={awardXP}
          onGoHome={() => setScreen('home')}
        />
      ),
  };

  return (
    <div
      className="min-h-screen text-amber-50 relative overflow-hidden dungeon-bg-root"
      style={{
        fontFamily: "'Cinzel', 'Trajan Pro', Georgia, serif",
        background: 'radial-gradient(ellipse at top, #1a0e08 0%, #0a0604 50%, #000000 100%)',
      }}
    >
      <div
        className="fixed inset-0 opacity-[0.04] pointer-events-none dungeon-bg-noise"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <div
        className="fixed inset-0 pointer-events-none dungeon-bg-vignette"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%)',
        }}
      />
      <div
        className="fixed inset-0 pointer-events-none dungeon-bg-corners"
        style={{
          background:
            'radial-gradient(circle at 20% 80%, rgba(255,140,0,0.08), transparent 40%), radial-gradient(circle at 80% 20%, rgba(220,38,38,0.06), transparent 40%)',
        }}
      />

      {/* Phase 43c: hidden KaTeX sentinel. RichContent encounters a math
          node here on every page load, triggering the lazy-import of the
          katex chunk. After the import resolves, `window.katex` is
          populated (see loadKatex in RichContent.jsx) so external probes
          and the "Live preview" row in Edit Metadata both find KaTeX
          available without the user needing to first enter a math
          expression somewhere. Hidden visually but kept in the DOM tree
          so the import side-effect actually fires. */}
      <div aria-hidden="true" className="sr-only" data-katex-sentinel>
        <RichContent text="$x$" as="span" />
      </div>

      {rlsExposed && <RlsWarningBanner onDismiss={() => setRlsExposed(false)} />}

      {sync.mergeRequired && (
        <MergeChooser
          localState={sync.localPreview}
          cloudState={sync.cloudPreview}
          onResolve={async (choice) => {
            if (choice === 'cancel') {
              await signOut();
            }
            sync.resolveMerge(choice);
          }}
        />
      )}

      {modalOpen.account && (
        <AccountPanel
          user={user}
          syncStatus={sync.status}
          lastSyncedAt={null}
          onClose={() => closeModal('account')}
          onResetProgress={resetProgress}
          playerState={playerState}
          onImportSave={(s) => setPlayerState(s)}
        />
      )}

      {/* Phase 33c QA P3: in-DOM abandon confirm. Visible to test tools and
          screen readers; survives auto-dismiss heuristics that suppressed the
          earlier window.confirm. */}
      {pendingConfirm && (
        <ConfirmModal
          title={pendingConfirm.title}
          body={pendingConfirm.body}
          confirmLabel={pendingConfirm.confirmLabel}
          cancelLabel={pendingConfirm.cancelLabel}
          confirmVariant={pendingConfirm.confirmVariant}
          onConfirm={() => {
            const fn = pendingConfirm.onConfirm;
            setPendingConfirm(null);
            try {
              fn?.();
            } catch {
              /* ignore */
            }
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {notification && (
        // Phase 38a/39b/44c: clickable notifications + SR a11y + hover/
        // focus pause. role=status + aria-live=polite so SR users hear
        // resume/success events. Toast at top-20 below header chrome.
        // Width capped at max-w-md. 44c: pointer hover or keyboard focus
        // pauses the auto-dismiss timer (clears notifTimeoutRef on enter,
        // re-arms on leave) so the user has time to actually click "Undo"
        // on a vault vanquish.
        <div
          role={notification.onClick ? 'button' : 'status'}
          aria-live="polite"
          tabIndex={notification.onClick ? 0 : undefined}
          onClick={() => {
            if (!notification.onClick) return;
            try {
              notification.onClick();
            } catch {
              /* ignore */
            }
            setNotification(null);
          }}
          onMouseEnter={() => {
            if (notifTimeoutRef.current) {
              clearTimeout(notifTimeoutRef.current);
              notifTimeoutRef.current = null;
            }
          }}
          onMouseLeave={() => {
            if (notifTimeoutRef.current || !notification) return;
            const remaining = notification.timeoutMs || 3000;
            notifTimeoutRef.current = setTimeout(() => {
              setNotification(null);
              notifTimeoutRef.current = null;
            }, remaining);
          }}
          onFocus={() => {
            if (notifTimeoutRef.current) {
              clearTimeout(notifTimeoutRef.current);
              notifTimeoutRef.current = null;
            }
          }}
          onBlur={() => {
            if (notifTimeoutRef.current || !notification) return;
            const remaining = notification.timeoutMs || 3000;
            notifTimeoutRef.current = setTimeout(() => {
              setNotification(null);
              notifTimeoutRef.current = null;
            }, remaining);
          }}
          onKeyDown={(e) => {
            if (!notification.onClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              try {
                notification.onClick();
              } catch {
                /* ignore */
              }
              setNotification(null);
            }
          }}
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md px-6 py-3 rounded border-2 backdrop-blur-md text-center ${
            notification.type === 'levelup'
              ? 'bg-amber-900/80 border-amber-400 text-amber-100'
              : notification.type === 'achievement'
                ? 'bg-purple-900/80 border-purple-400 text-purple-100'
                : notification.type === 'xp'
                  ? 'bg-emerald-900/80 border-emerald-500 text-emerald-100'
                  : notification.type === 'success'
                    ? 'bg-emerald-900/80 border-emerald-500 text-emerald-100'
                    : notification.type === 'error'
                      ? 'bg-red-900/80 border-red-500 text-red-100'
                      : 'bg-stone-900/80 border-stone-600 text-amber-50'
          } ${notification.onClick ? 'cursor-pointer hover:brightness-110' : ''}`}
          style={{ boxShadow: '0 0 20px rgba(245, 158, 11, 0.3)' }}
        >
          {notification.msg}
          {notification.onClick && (
            // Phase 43a: just a small ↗ glyph (was "↗ click to view" — wrong
            // for non-view actions like undo). The msg already includes the
            // verb ("· Undo", "· View"), and the pointer cursor + hover
            // brightness make the affordance obvious.
            <span className="ml-2 text-[10px] italic opacity-75">↗</span>
          )}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto p-6">
        {/* Phase 30f QA #14: skip-to-main link for keyboard users. Hidden
            until focused (.skip-to-main:focus rule in index.css). */}
        <a href="#main-content" className="skip-to-main sr-only">
          Skip to main content
        </a>
        <header className="flex items-center justify-between mb-8 pb-4 border-b-2 border-amber-700/40">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Castle
                className="w-10 h-10 text-amber-400"
                style={{ filter: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))' }}
              />
            </div>
            <div>
              <h1
                className="text-3xl font-bold tracking-wider"
                style={{
                  background: 'linear-gradient(to bottom, #fbbf24 0%, #d97706 50%, #92400e 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: '0 0 20px rgba(245, 158, 11, 0.3)',
                  fontFamily: "'Cinzel', serif",
                }}
              >
                DUNGEON SCHOLAR
              </h1>
              <p className="text-xs text-amber-700 tracking-[0.3em] italic">⚜ A SCHOLAR'S QUEST ⚜</p>
            </div>
          </div>
          {/* Phase 30f QA #14: navigation landmark for the action-button row. */}
          <nav aria-label="Primary" className="flex items-center gap-3 text-sm">
            {/* Keyboard-shortcut help — also reachable via the `?` hotkey. */}
            <button
              onClick={() => openModal('shortcuts')}
              className="p-2 rounded-sm border-2 border-amber-700/60 text-amber-300 hover:bg-amber-900/30"
              title="Keyboard shortcuts (?)"
              aria-label="Show keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" aria-hidden="true" />
            </button>
            {/* Gold pill */}
            {/* Phase 30h QA #15/#20: each header counter now carries an aria-label
                that names the destination AND inlines the count, so the icon-to-page
                mapping is unambiguous for screen-reader + tooltip users. Counts read
                from the same source-of-truth expressions the destination pages use. */}
            <div
              className="px-3 py-2 rounded-sm border-2 border-amber-700/60 flex items-center gap-2"
              style={{
                background:
                  'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.5), rgba(var(--surface-amber, 41, 24, 12), 0.85))',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.15), inset 0 0 10px rgba(0,0,0,0.4)',
              }}
              title={`Gold: ${playerState.gold || 0}`}
              aria-label={`Gold: ${playerState.gold || 0}`}
            >
              <Coins
                className="w-4 h-4 text-amber-300"
                style={{ filter: 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.6))' }}
                aria-hidden="true"
              />
              <span className="text-amber-200 font-bold italic tabular-nums">{playerState.gold || 0}</span>
            </div>
            <button
              onClick={() => setScreen('quests')}
              className="p-3 hover:bg-purple-900/30 rounded-sm transition border-2 border-purple-700/50 hover:border-purple-500 relative"
              title={claimableQuestCount > 0 ? `Quest Board (${claimableQuestCount} ready to claim)` : 'Quest Board'}
              aria-label={
                claimableQuestCount > 0
                  ? `Open Quest Board, ${claimableQuestCount} reward${claimableQuestCount === 1 ? '' : 's'} ready to claim`
                  : 'Open Quest Board'
              }
            >
              <ScrollText className="w-5 h-5 text-purple-300" aria-hidden="true" />
              {claimableQuestCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 bg-purple-500 text-amber-50 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-purple-300 animate-pulse"
                  aria-hidden="true"
                >
                  {claimableQuestCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setScreen('library')}
              className="p-3 hover:bg-amber-900/30 rounded-sm transition border-2 border-amber-700/50 hover:border-amber-500 relative"
              title={`Library (${playerState.library.length} tome${playerState.library.length === 1 ? '' : 's'})`}
              aria-label={`Open Library, ${playerState.library.length} tome${playerState.library.length === 1 ? '' : 's'}`}
            >
              <Library className="w-5 h-5 text-amber-400" aria-hidden="true" />
              {playerState.library.length > 0 && (
                <span
                  className="absolute -top-1 -right-1 bg-amber-500 text-amber-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-amber-300"
                  aria-hidden="true"
                >
                  {playerState.library.length}
                </span>
              )}
            </button>
            {(() => {
              // Phase 30h QA #20: derive once, use everywhere — same expression
              // The Hoard page (InventoryScreen line ~7016) uses for "N items stowed",
              // so the badge and the destination page can never disagree.
              const inventoryCount = Object.values(playerState.inventory || {}).reduce((s, n) => s + (n || 0), 0);
              return (
                <button
                  onClick={() => setScreen('inventory')}
                  className="p-3 hover:bg-emerald-900/30 rounded-sm transition border-2 border-emerald-700/50 hover:border-emerald-500 relative"
                  title={`The Hoard (${inventoryCount} item${inventoryCount === 1 ? '' : 's'} stowed)`}
                  aria-label={`Open The Hoard, ${inventoryCount} item${inventoryCount === 1 ? '' : 's'} stowed`}
                >
                  <Package className="w-5 h-5 text-emerald-300" aria-hidden="true" />
                  {inventoryCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 bg-emerald-500 text-amber-950 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center border border-emerald-300"
                      aria-hidden="true"
                    >
                      {inventoryCount}
                    </span>
                  )}
                </button>
              );
            })()}
            <button
              onClick={() => setScreen('shop')}
              className="p-3 hover:bg-amber-900/30 rounded-sm transition border-2 border-amber-700/50 hover:border-amber-500"
              title={t('nav.marketplace')}
              aria-label={t('nav.marketplace.aria')}
            >
              <ShoppingBag className="w-5 h-5 text-amber-300" aria-hidden="true" />
            </button>
            <button
              onClick={() => setScreen('ledger')}
              className="p-3 hover:bg-sky-900/30 rounded-sm transition border-2 border-sky-700/50 hover:border-sky-500"
              title={t('nav.ledger.full')}
              aria-label={t('nav.ledger.aria')}
            >
              <TrendingUp className="w-5 h-5 text-sky-300" aria-hidden="true" />
            </button>
            <button
              onClick={() => openModal('achievements')}
              className="p-3 hover:bg-amber-900/30 rounded-sm transition border-2 border-amber-700/50 hover:border-amber-500"
              title="Hall of Glory"
              aria-label="Open Hall of Glory (achievements)"
            >
              <Trophy className="w-5 h-5 text-amber-400" aria-hidden="true" />
            </button>
            {screen !== 'home' && (
              <button
                onClick={() => {
                  // Phase 33c QA P3: in-app abandon confirm (replaces the
                  // earlier window.confirm — headless QA tools auto-dismissed
                  // it, making the Trial-of-Hours guard look silent).
                  if (screen === 'practiceExam') {
                    const saved = loadSession(SESSION_KIND.EXAM);
                    if (saved && saved.deadlineMs > Date.now()) {
                      setPendingConfirm({
                        title: '⚖ Abandon Thy Trial? ⚖',
                        body: 'Thy timed trial is still in flight — the sands cannot be paused. Stepping away now discards thy progress on this attempt.',
                        confirmLabel: 'Abandon Trial',
                        cancelLabel: 'Keep Going',
                        confirmVariant: 'danger',
                        onConfirm: () => {
                          // Phase 36f QA round 5 suggestion: log abandoned trials
                          // to practiceExams so they appear in Past Trials with a
                          // distinct 'abandoned' status (rather than silently
                          // disappearing, which made it hard to tell what was
                          // submitted-empty vs abandoned).
                          if (saved.tomeId) {
                            const elapsedSec = saved.totalSeconds
                              ? Math.max(
                                  0,
                                  saved.totalSeconds - Math.max(0, Math.ceil((saved.deadlineMs - Date.now()) / 1000)),
                                )
                              : 0;
                            const answeredCount = Array.isArray(saved.answers)
                              ? saved.answers.filter((a) => a !== null && a !== undefined && a !== '').length
                              : 0;
                            const record = {
                              startedAt: saved.startedAt || Date.now(),
                              durationSec: elapsedSec,
                              totalCount: Array.isArray(saved.sample) ? saved.sample.length : 0,
                              answered: answeredCount,
                              correct: 0,
                              scorePct: 0,
                              byDomain: {},
                              status: 'abandoned',
                            };
                            setPlayerState((prev) => ({
                              ...prev,
                              library: prev.library.map((t) => {
                                if (t.id !== saved.tomeId) return t;
                                const prior = Array.isArray(t.progress?.practiceExams) ? t.progress.practiceExams : [];
                                return {
                                  ...t,
                                  progress: { ...t.progress, practiceExams: [...prior, record].slice(-20) },
                                };
                              }),
                            }));
                          }
                          clearSession(SESSION_KIND.EXAM);
                          setScreen('home');
                        },
                      });
                      return;
                    }
                  }
                  // Phase 32a QA #2: clear quiz/flashcards session on explicit
                  // Hearth nav so a subsequent refresh from Hearth doesn't
                  // surprise-auto-route the user back to study.
                  if (screen === 'quiz') clearSession(SESSION_KIND.QUIZ);
                  if (screen === 'flashcards') clearSession(SESSION_KIND.FLASHCARDS);
                  setScreen('home');
                }}
                className="px-3 py-2.5 hover:bg-amber-900/30 rounded-sm transition border-2 border-amber-700/50 hover:border-amber-500 flex items-center gap-2 text-amber-200"
              >
                <Home className="w-4 h-4" /> Hearth
              </button>
            )}
          </nav>
        </header>

        <main id="main-content" tabIndex={-1}>
          <ErrorBoundary onReset={() => setScreen('home')}>
            <div
              className="mb-6 p-4 rounded-sm relative"
              style={{
                background:
                  'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.9) 0%, rgba(var(--surface-modal, 20, 12, 6), 0.9) 100%)',
                border: '2px solid rgba(180, 83, 9, 0.5)',
                boxShadow: '0 0 30px rgba(180, 83, 9, 0.15), inset 0 0 20px rgba(0,0,0,0.5)',
              }}
            >
              <div className="absolute top-1 left-1 text-amber-700 text-xs">⚜</div>
              <div className="absolute top-1 right-1 text-amber-700 text-xs">⚜</div>
              <div className="absolute bottom-1 left-1 text-amber-700 text-xs">⚜</div>
              <div className="absolute bottom-1 right-1 text-amber-700 text-xs">⚜</div>

              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div
                      className="w-16 h-16 flex items-center justify-center text-3xl font-bold border-2 border-amber-500 text-amber-200"
                      style={{
                        background:
                          'radial-gradient(circle, rgba(var(--surface-amber-strong, 120, 53, 15), 0.8) 0%, rgba(var(--surface-amber, 41, 24, 12), 0.9) 100%)',
                        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                        boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
                        textShadow: '0 0 10px rgba(245, 158, 11, 0.8)',
                      }}
                    >
                      {playerState.level}
                    </div>
                  </div>
                  <div>
                    <button
                      onClick={() => openModal('titles')}
                      className="text-xl font-bold text-amber-300 hover:text-amber-200 transition flex items-center gap-1 italic"
                      style={{ textShadow: '0 0 10px rgba(245, 158, 11, 0.4)' }}
                    >
                      {currentTitle} <ChevronRight className="w-4 h-4" />
                    </button>
                    <div className="text-xs text-amber-700 tracking-wider">
                      ⚔ Level {playerState.level} • {playerState.totalXp.toLocaleString()} Total XP ⚔
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-w-[200px] max-w-md">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-amber-700 tracking-widest">EXPERIENCE</span>
                    <span className="text-amber-400">
                      {playerState.xp} / {xpNeeded}
                    </span>
                  </div>
                  <div
                    className="h-4 rounded-full overflow-hidden border-2 border-amber-800"
                    style={{
                      background: 'linear-gradient(to bottom, #1c1917 0%, #0c0a09 100%)',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
                    }}
                  >
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${xpPercent}%`,
                        background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 50%, #b45309 100%)',
                        boxShadow: '0 0 10px rgba(245, 158, 11, 0.6)',
                      }}
                    />
                  </div>
                </div>
                {/* Phase 40a QA P1: each counter now has an aria-label + title
                that names what it actually tracks. The visible label stays
                short for the dungeon aesthetic, but hover / screen reader
                gets the precise definition so users don't expect the
                Quest-Board claim count when they see "QUESTS". The
                Dungeon-Delve label is renamed "DELVES" — clearer mapping
                to the in-product Dungeon Delve concept, and avoids the
                quest-board collision that triggered the QA report. */}
                <div className="flex gap-4 text-sm">
                  <div
                    className="text-center"
                    title={`Riddles answered correctly (lifetime): ${playerState.totalCorrect}`}
                    aria-label={`Victories — ${playerState.totalCorrect} correct riddles answered, lifetime`}
                  >
                    <div
                      className="text-emerald-400 font-bold text-lg"
                      style={{ textShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }}
                    >
                      {playerState.totalCorrect}
                    </div>
                    <div className="text-xs text-amber-700 tracking-wider">VICTORIES</div>
                  </div>
                  <div
                    className="text-center"
                    title={`Dungeon Delve runs completed across all tomes (Quest Board claims are tracked separately on the Quest Board itself)`}
                    aria-label={`Delves — ${playerState.library.reduce((sum, t) => sum + (t.progress?.runsCompleted || 0), 0)} Dungeon Delve runs completed across all tomes. Not the same as Quest Board claims.`}
                  >
                    <div
                      className="text-purple-400 font-bold text-lg"
                      style={{ textShadow: '0 0 8px rgba(168, 85, 247, 0.5)' }}
                    >
                      {playerState.library.reduce((sum, t) => sum + (t.progress?.runsCompleted || 0), 0)}
                    </div>
                    <div className="text-xs text-amber-700 tracking-wider">DELVES</div>
                  </div>
                  <div
                    className="text-center"
                    title={`Dungeon-lord bosses defeated across all tomes`}
                    aria-label={`Dragons — ${playerState.library.reduce((sum, t) => sum + (t.progress?.bossesDefeated || 0), 0)} dungeon-lord bosses defeated across all tomes`}
                  >
                    <div
                      className="text-red-400 font-bold text-lg"
                      style={{ textShadow: '0 0 8px rgba(239, 68, 68, 0.5)' }}
                    >
                      {playerState.library.reduce((sum, t) => sum + (t.progress?.bossesDefeated || 0), 0)}
                    </div>
                    <div className="text-xs text-amber-700 tracking-wider">DRAGONS</div>
                  </div>
                </div>
                {user && <ProfileChip user={user} syncStatus={sync.status} onOpen={() => openModal('account')} />}
              </div>
            </div>

            {/* PHASE-39 39H: one Suspense boundary for every lazy-loaded screen (HomeScreen
            stays static so first paint never suspends). Modals/tutorial panel below stay outside. */}
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center py-24 text-amber-300 italic">
                  <Loader2 className="w-6 h-6 animate-spin mr-3" /> Summoning...
                </div>
              }
            >
              {/* PHASE-41 41B: chokepoint. When the active tome is sealed-but-locked
            and the player is on a content-consuming screen, render the unlock
            prompt INSTEAD of the screen. Home/library/shop/etc. stay reachable
            while locked (they don't read decrypted content). */}
              {sealedLocked && SEALED_GATED.includes(screen) ? (
                <SealedTomeGate
                  title={activeTome.data.metadata.title}
                  onUnlock={(pass) => unlockSealedTome(activeTome.id, pass)}
                  onBack={() => setScreen('library')}
                />
              ) : (
                screenViews[screen]?.()
              )}
            </React.Suspense>

            <input type="file" ref={fileInputRef} accept=".json" onChange={handleImportFile} className="hidden" />

            {modalOpen.prompt && <PromptModal onClose={() => closeModal('prompt')} />}
            {modalOpen.paste && <PasteTomeModal onClose={() => closeModal('paste')} onSubmit={handlePasteImport} />}
            {modalOpen.importDeck && (
              <ImportDeckModal onClose={() => closeModal('importDeck')} onSubmit={handleDeckImport} />
            )}
            {modalOpen.occlusionAuthor && (
              <OcclusionAuthor onClose={() => closeModal('occlusionAuthor')} onCreate={handleOcclusionCreate} />
            )}
            {modalOpen.importCode && (
              <ImportCodeModal onClose={() => closeModal('importCode')} onSubmit={handleShareCodeImport} />
            )}
            {shareTomeId && (
              <ShareTomeModal
                tome={playerState.library.find((t) => t.id === shareTomeId)}
                onClose={() => setShareTomeId(null)}
              />
            )}
            {editContentTomeId && (
              <TomeEditor
                tome={playerState.library.find((t) => t.id === editContentTomeId)}
                onSave={(newData) => {
                  setPlayerState((prev) => ({
                    ...prev,
                    library: prev.library.map((t) => (t.id === editContentTomeId ? { ...t, data: newData } : t)),
                  }));
                  setEditContentTomeId(null);
                  showNotif('Tome content updated', 'success');
                }}
                onClose={() => setEditContentTomeId(null)}
              />
            )}
            {editMetadataTomeId && (
              <MetadataEditModal
                tome={playerState.library.find((t) => t.id === editMetadataTomeId)}
                onSave={(updates) => {
                  updateTomeMetadata(editMetadataTomeId, updates);
                  setEditMetadataTomeId(null);
                  showNotif('Tome metadata updated', 'success');
                }}
                onClose={() => setEditMetadataTomeId(null)}
              />
            )}
            {notesTome && (
              <TomeNotes
                tome={playerState.library.find((t) => t.id === notesTome.id) || notesTome}
                onSave={(p) => updateTomeNotes(notesTome.id, p)}
                onClose={() => setNotesTome(null)}
              />
            )}
            {modalOpen.resetConfirm && (
              <ResetConfirmModal onConfirm={confirmReset} onCancel={() => closeModal('resetConfirm')} />
            )}
            {modalOpen.shortcuts && <ShortcutHelpModal onClose={() => closeModal('shortcuts')} />}
            {modalOpen.achievements && (
              <AchievementsModal playerState={playerState} onClose={() => closeModal('achievements')} />
            )}
            {modalOpen.welcome && <WelcomeModal onStart={startTutorial} onSkip={skipTutorial} />}

            {/* Tutorial side panel */}
            {playerState.tutorialStarted && !playerState.tutorialCompleted && (
              <TutorialPanel
                stepIndex={playerState.tutorialStepIndex}
                collapsed={playerState.tutorialPanelCollapsed}
                onToggle={toggleTutorialPanel}
                onAdvance={advanceTutorial}
                onSkip={skipTutorial}
                onAction={(stepId) => {
                  if (stepId === 'forge_tome') openModal('prompt');
                  else if (stepId === 'library_tour') {
                    setTutorialOpenedSurface('library');
                    setScreen('library');
                  } else if (stepId === 'study_scroll') {
                    trackModeUse('flashcards');
                    setScreen('flashcards');
                  } else if (stepId === 'solve_riddle') {
                    trackModeUse('quiz');
                    setScreen('quiz');
                  } else if (stepId === 'face_trial') {
                    trackModeUse('lab');
                    setScreen('lab');
                  } else if (stepId === 'vault_intro') {
                    setTutorialOpenedSurface('vault');
                    setScreen('vault');
                  } else if (stepId === 'consult_oracle') {
                    trackModeUse('chat');
                    setScreen('chat');
                  } else if (stepId === 'quest_board') {
                    setTutorialOpenedSurface('quests');
                    setScreen('quests');
                  } else if (stepId === 'enter_dungeon') {
                    trackModeUse('dungeon');
                    setScreen('dungeon');
                  } else if (stepId === 'view_achievements') {
                    setTutorialOpenedSurface('achievements');
                    openModal('achievements');
                  } else if (stepId === 'view_titles_levels') {
                    setTutorialOpenedSurface('titles');
                    openModal('titles');
                  } else if (stepId === 'bestiary_intro') {
                    setTutorialOpenedSurface('bestiary');
                    setScreen('bestiary');
                  } else if (stepId === 'stable_intro') {
                    setTutorialOpenedSurface('stable');
                    setScreen('stable');
                  } else if (stepId === 'spellbook_intro') {
                    setTutorialOpenedSurface('spellbook');
                    setScreen('spellbook');
                  } else if (stepId === 'calendar_intro') {
                    setTutorialOpenedSurface('calendar');
                    setScreen('calendar');
                  } else if (stepId === 'crafting_intro') {
                    setTutorialOpenedSurface('crafting');
                    setScreen('crafting');
                  } else if (stepId === 'domain_intro') {
                    setScreen('domainStudy');
                  } else if (stepId === 'ascension_intro') {
                    setTutorialOpenedSurface('ascension');
                    setScreen('ascension');
                  }
                }}
              />
            )}
            {modalOpen.titles && (
              <TitlesModal
                playerState={playerState}
                onSelect={(t) => {
                  setPlayerState((prev) => ({ ...prev, selectedTitle: t }));
                  closeModal('titles');
                }}
                onClose={() => closeModal('titles')}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
