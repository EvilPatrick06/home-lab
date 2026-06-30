import { BookOpen, ChevronRight, Loader2, Send, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { getOracleEndpoint, isOracleConfigured, ORACLE_MODEL } from '../../services/oracleGrader.js';
import { oracleSourcesForAnswer } from './oracleSources.js';

function ChatMode({ courseSet, tomeProgress, updateTomeProgress, checkAchievement }) {
  // Chat history lives in tome progress so it persists across navigation, reloads, and journal restores
  const messages = tomeProgress?.chatHistory || [];
  const _setMessages = (updater) => {
    updateTomeProgress((prev) => ({
      // 17D functional form — base off live progress, not the stale render closure
      chatHistory: typeof updater === 'function' ? updater(prev.chatHistory || []) : updater,
    }));
  };

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(isOracleConfigured() ? 'oracle' : 'search'); // 18B: default to Tome Search when no Oracle
  const [expandedSources, setExpandedSources] = useState({});
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // 19A: inline overlay — hook armed only while the confirm is rendered.
  const clearConfirmRef = useDialogA11y({ onClose: () => setShowClearConfirm(false), active: showClearConfirm });
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Build searchable index from the tome
  const searchIndex = useMemo(() => {
    const items = [];
    const kb = courseSet.knowledgeBase || courseSet.knowledge_base || '';
    if (kb) {
      // Split knowledge base into chunks (paragraphs or by domain markers)
      const chunks = kb.split(/\n\n+|=== /).filter((c) => c.trim().length > 50);
      chunks.forEach((chunk, i) => {
        items.push({
          id: `kb_${i}`,
          type: 'knowledgeBase',
          typeLabel: 'Knowledge Base',
          icon: '📖',
          text: chunk.trim(),
          searchText: chunk.toLowerCase(),
        });
      });
    }
    (courseSet.flashcards || []).forEach((card) => {
      const text = `${card.front || card.term || ''}: ${card.back || card.definition || ''}`;
      items.push({
        id: card.id,
        type: 'flashcard',
        typeLabel: 'Scroll',
        icon: '📜',
        text,
        searchText: text.toLowerCase(),
        front: card.front || card.term,
        back: card.back || card.definition,
      });
    });
    (courseSet.quiz || []).forEach((q) => {
      const optionsText = (q.options || []).join(' ');
      const correctAnswer = q.options
        ? q.options[q.correctIndex]
        : (q.correctAnswer ?? (q.acceptedAnswers || []).join(' / '));
      const text = `${q.question || ''} ${optionsText} ${q.explanation || ''}`;
      items.push({
        id: q.id,
        type: 'quiz',
        typeLabel: 'Riddle',
        icon: '🔮',
        text,
        searchText: text.toLowerCase(),
        question: q.question,
        correctAnswer,
        explanation: q.explanation,
      });
    });
    (courseSet.labs || []).forEach((lab) => {
      const stepsText = (lab.steps || lab.stages || [])
        .map((s) => `${s.prompt || s.question || ''} ${s.explanation || ''}`)
        .join(' ');
      const text = `${lab.title || ''} ${lab.scenario || ''} ${stepsText}`;
      items.push({
        id: lab.id,
        type: 'lab',
        typeLabel: 'Trial',
        icon: '⚗️',
        text,
        searchText: text.toLowerCase(),
        title: lab.title,
        scenario: lab.scenario,
      });
    });
    return items;
  }, [courseSet]);

  // Stem a word — strip common English suffixes for better matching
  const stem = (word) => {
    const w = word.toLowerCase();
    if (w.length <= 3) return w;
    // Common suffix removal in order
    const suffixes = [
      'ation',
      'ations',
      'tions',
      'sions',
      'ments',
      'ness',
      'ities',
      'iest',
      'edly',
      'ingly',
      'ically',
      'ical',
      'ization',
      'izing',
      'izes',
      'ized',
      'ing',
      'ies',
      'ied',
      'ier',
      'est',
      'ers',
      'ed',
      'es',
      's',
      'ly',
      'er',
    ];
    for (const suf of suffixes) {
      if (w.length - suf.length >= 3 && w.endsWith(suf)) {
        return w.slice(0, w.length - suf.length);
      }
    }
    return w;
  };

  // Search the tome with stem-based scoring
  const searchTome = (query, limit = 5) => {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'and',
      'or',
      'but',
      'if',
      'then',
      'of',
      'in',
      'on',
      'at',
      'to',
      'for',
      'with',
      'by',
      'from',
      'as',
      'about',
      'what',
      'how',
      'why',
      'when',
      'where',
      'who',
      'which',
      'this',
      'that',
      'these',
      'those',
      'do',
      'does',
      'did',
      'have',
      'has',
      'had',
      'can',
      'could',
      'should',
      'would',
      'will',
      'shall',
      'may',
      'might',
      'must',
      'i',
      'you',
      'me',
      'my',
      'your',
      'we',
      'us',
      'our',
      'they',
      'them',
      'their',
      'it',
      'its',
      'so',
      'too',
    ]);
    const queryWords = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 1 && !stopWords.has(w));
    if (queryWords.length === 0) return [];
    const queryStems = queryWords.map(stem);

    const scored = searchIndex.map((item) => {
      let score = 0;
      const itemWords = item.searchText.split(/\W+/).filter((w) => w.length > 1);
      const itemStems = new Set(itemWords.map(stem));

      queryStems.forEach((qs, qi) => {
        // Exact stem match (best)
        if (itemStems.has(qs)) {
          score += 10;
        }
        // Substring match in text (good for technical jargon, hyphenated terms)
        else if (item.searchText.includes(queryWords[qi])) {
          score += 7;
        }
        // Partial stem match (e.g., "encrypt" appears in "encryption")
        else {
          for (const its of itemStems) {
            if (its.length >= 4 && qs.length >= 4 && (its.startsWith(qs) || qs.startsWith(its))) {
              score += 5;
              break;
            }
          }
        }
      });
      // Bonus: phrase match
      if (queryWords.length >= 2 && item.searchText.includes(queryWords.join(' '))) {
        score += 15;
      }
      return { ...item, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  };

  // Build a search-result message (no AI)
  const renderSearchResults = (query) => {
    const results = searchTome(query, 6);
    if (results.length === 0) {
      return {
        role: 'search',
        content:
          'The tome holds no clear answer to that question, brave scholar. Try rephrasing, or ask about a specific term, concept, or domain covered in this tome.',
        sources: [],
      };
    }
    const intro = `I have searched the tome and found ${results.length} relevant passage${results.length === 1 ? '' : 's'} that may illuminate your question:`;
    return { role: 'search', content: intro, sources: results };
  };

  const buildSystemPrompt = (relevantSources) => {
    const tomeTitle = courseSet.metadata.title;
    const sourceText =
      relevantSources.length > 0
        ? `\n\n=== RELEVANT TOME EXCERPTS (use these as your primary source of truth) ===\n${relevantSources.map((s, i) => `[${i + 1}] (${s.typeLabel}) ${s.text}`).join('\n\n')}\n=== END OF TOME EXCERPTS ===`
        : '';
    return `You are the Oracle, a wise and ancient sage who guides scholars through the tome titled "${tomeTitle}". Speak with the warmth of a beloved mentor and the gravitas of one who has studied these mysteries for an age. You may use light fantasy flourishes ("brave scholar", "young one") but stay rigorous and clear above all.

PRIMARY DIRECTIVE: Use the tome as your source of truth. The relevant excerpts below have been retrieved for this question — base your answer on them whenever possible. When you cite information from the tome, reference it like [1] or [2] matching the excerpt numbers below. If the tome does not cover the question, you may draw on broader knowledge but say so explicitly (e.g., "This goes beyond the current tome, but...").
${sourceText}`;
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
    const newMessages = [...messages, userMsg];
    const query = input;
    setInput('');

    // Append the user turn to the LIVE history (not the stale render copy) and
    // bump the oracle counter together (17D). newMessages/newOracleCount stay for
    // the request payload + the oracle_friend threshold check below.
    const newOracleCount = (tomeProgress?.oracleMessages || 0) + 1;
    updateTomeProgress((prev) => ({
      chatHistory: [...(prev.chatHistory || []), userMsg],
      oracleMessages: (prev.oracleMessages || 0) + 1,
    }));
    if (newOracleCount >= 25 && checkAchievement) checkAchievement('oracle_friend');

    // Search-only mode: no AI call
    if (mode === 'search') {
      const result = renderSearchResults(query);
      updateTomeProgress((prev) => ({ chatHistory: [...(prev.chatHistory || []), result] })); // 17D
      return;
    }

    // M9 (18B): Oracle requested but not configured on this deployment ⇒ notice + Tome Search.
    if (!isOracleConfigured()) {
      const result = renderSearchResults(query);
      updateTomeProgress((prev) => ({
        chatHistory: [
          ...(prev.chatHistory || []),
          {
            role: 'system_notice',
            content: 'The Oracle is not configured on this deployment. Falling back to Tome Search.',
          },
          result,
        ],
      }));
      return;
    }

    // Oracle mode: search tome, send to AI, fall back to search on failure
    setLoading(true);
    // PHASE-05 05C: top-K excerpts only — the full KB is no longer inlined, so
    // raise K modestly now that the body is bounded.
    const relevantSources = searchTome(query, 8);

    let fallbackReason = null;
    try {
      const response = await fetch(getOracleEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ORACLE_MODEL,
          max_tokens: 1000,
          system: buildSystemPrompt(relevantSources),
          // PHASE-05 05C: bound history to the last turns so long chats don't re-bloat the body.
          messages: newMessages.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-12),
        }),
      });
      if (!response.ok) {
        if (response.status === 429)
          fallbackReason = "The Oracle's voice is silent — too many petitions today. Falling back to Tome Search.";
        else if (response.status === 401 || response.status === 403)
          fallbackReason = 'The Oracle cannot be reached at present. Falling back to Tome Search.';
        else if (response.status === 413)
          fallbackReason = 'The Oracle cannot hold so great a tome at once — showing local matches.';
        else fallbackReason = 'The Oracle stumbles. Falling back to Tome Search.';

        try {
          const errBody = await response.text();
          const lower = errBody.toLowerCase();
          if (
            lower.includes('rate') ||
            lower.includes('quota') ||
            lower.includes('limit') ||
            lower.includes('exceeded')
          ) {
            fallbackReason = "The Oracle's voice is silent — quota or rate limit reached. Falling back to Tome Search.";
          }
        } catch {}
      } else {
        const data = await response.json();
        const text =
          data.content
            ?.filter((c) => c.type === 'text')
            .map((c) => c.text)
            .join('\n') || '';
        const lower = text.toLowerCase();
        if (data.error || lower.includes('rate limit') || lower.includes('quota')) {
          fallbackReason = "The Oracle's voice is silent — quota or rate limit reached. Falling back to Tome Search.";
        } else if (!text) {
          fallbackReason = 'The Oracle was silent. Falling back to Tome Search.';
        } else {
          updateTomeProgress((prev) => ({
            chatHistory: [
              ...(prev.chatHistory || []),
              // PHASE-08 08D: only attach tome sources that actually support the
              // answer — suppress them on an out-of-tome answer or weak lexical hits.
              { role: 'assistant', content: text, sources: oracleSourcesForAnswer(text, relevantSources) },
            ],
          })); // 17D
          setLoading(false);
          return;
        }
      }
    } catch (_err) {
      fallbackReason = 'The mystic connection has faltered. Falling back to Tome Search.';
    }

    // Fallback path
    const fallback = renderSearchResults(query);
    updateTomeProgress((prev) => ({
      // 17D
      chatHistory: [...(prev.chatHistory || []), { role: 'system_notice', content: fallbackReason }, fallback],
    }));
    setLoading(false);
  };

  const clearChat = () => {
    updateTomeProgress({ chatHistory: [] });
    setShowClearConfirm(false);
  };

  const toggleSource = (msgIdx, srcIdx) => {
    const key = `${msgIdx}-${srcIdx}`;
    setExpandedSources((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col h-[70vh] max-w-3xl mx-auto">
      {/* Mode toggle */}
      <div
        className="flex items-center justify-between mb-2 p-3 rounded-sm gap-3 flex-wrap"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.8) 0%, rgba(var(--surface-modal, 20, 12, 6), 0.9) 100%)',
          border: '2px solid rgba(180, 83, 9, 0.5)',
        }}
      >
        <div className="flex flex-col">
          <div className="text-xs text-amber-700 italic tracking-wider">⚜ MODE OF INQUIRY ⚜</div>
          <div className="text-[10px] italic mt-0.5" style={{ color: mode === 'oracle' ? '#fcd34d' : '#86efac' }}>
            {mode === 'oracle' ? '🔮 AI-powered' : '📜 Local tome search'}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {messages.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-2 py-1.5 rounded-sm text-xs italic border-2 border-red-800 text-red-300 hover:bg-red-900/30 flex items-center gap-1"
              style={{ background: 'rgba(var(--surface-red, 41, 12, 12), 0.6)' }}
              title="Clear chat history"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
          <div
            className="flex gap-1 p-1 rounded-sm"
            style={{
              background: 'rgba(var(--surface-deep, 10, 6, 4), 0.7)',
              border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)',
            }}
          >
            <button
              onClick={() => setMode('oracle')}
              className="px-3 py-1.5 rounded-sm text-xs font-bold italic transition flex items-center gap-1"
              style={
                mode === 'oracle'
                  ? {
                      background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                      color: '#451a03',
                      boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
                    }
                  : { background: 'transparent', color: '#fcd34d' }
              }
            >
              <Wand2 className="w-3 h-3" /> The Oracle
            </button>
            <button
              onClick={() => setMode('search')}
              className="px-3 py-1.5 rounded-sm text-xs font-bold italic transition flex items-center gap-1"
              style={
                mode === 'search'
                  ? {
                      background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
                      color: '#451a03',
                      boxShadow: '0 0 10px rgba(245, 158, 11, 0.5)',
                    }
                  : { background: 'transparent', color: '#fcd34d' }
              }
            >
              <BookOpen className="w-3 h-3" /> Tome Search
            </button>
          </div>
        </div>
      </div>

      <div
        className="flex-1 rounded-t p-4 overflow-y-auto overscroll-contain space-y-3 relative"
        style={{
          background:
            'linear-gradient(135deg, rgba(var(--surface-amber, 41, 24, 12), 0.85) 0%, rgba(var(--surface-modal, 20, 12, 6), 0.95) 100%)',
          border: '2px solid rgba(245, 158, 11, 0.5)',
          borderBottom: 'none',
          boxShadow: 'inset 0 0 30px rgba(0,0,0,0.5)',
        }}
      >
        {messages.length === 0 && (
          <div className="text-center text-amber-100/60 py-8">
            {mode === 'oracle' ? (
              <>
                <Wand2
                  className="w-16 h-16 mx-auto text-amber-400 mb-3"
                  style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }}
                />
                <div className="italic text-lg">Speak, brave scholar...</div>
                <div className="text-sm mt-2 italic">
                  The Oracle awaits your questions on <span className="text-amber-300">{courseSet.metadata.title}</span>
                </div>
                <div className="text-xs mt-3 text-amber-700 italic max-w-md mx-auto">
                  The Oracle searches the tome for truth and shall reference its sources.
                </div>
              </>
            ) : (
              <>
                <BookOpen
                  className="w-16 h-16 mx-auto text-amber-400 mb-3"
                  style={{ filter: 'drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))' }}
                />
                <div className="italic text-lg">Search the tome directly...</div>
                <div className="text-sm mt-2 italic">
                  No magic shall be summoned — only the tome's own pages of{' '}
                  <span className="text-amber-300">{courseSet.metadata.title}</span>
                </div>
                <div className="text-xs mt-3 text-amber-700 italic max-w-md mx-auto">
                  Type a term, concept, or question and the most relevant passages shall be revealed.
                </div>
              </>
            )}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'system_notice') {
            return (
              <div key={i} className="flex justify-center">
                <div
                  className="px-4 py-2 rounded-sm text-xs italic max-w-[90%] text-center"
                  style={{
                    background: 'rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    color: 'var(--color-amber-300)',
                  }}
                >
                  ⚠ {m.content}
                </div>
              </div>
            );
          }
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div
                  className="max-w-[80%] p-3 rounded-sm"
                  style={{
                    background:
                      'linear-gradient(to bottom, rgba(var(--surface-amber-strong, 120, 53, 15), 0.6), rgba(var(--surface-amber, 41, 24, 12), 0.8))',
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    color: 'var(--color-amber-100)',
                  }}
                >
                  <div className="whitespace-pre-wrap italic">{m.content}</div>
                </div>
              </div>
            );
          }
          // Oracle assistant or search result
          const isSearch = m.role === 'search';
          return (
            <div key={i} className="flex justify-start">
              <div className="max-w-[90%] flex flex-col gap-2">
                <div
                  className="p-3 rounded-sm"
                  style={{
                    background: isSearch ? 'rgba(12, 24, 41, 0.7)' : 'rgba(var(--surface-amber, 41, 24, 12), 0.7)',
                    border: `1px solid ${isSearch ? 'rgba(59, 130, 246, 0.4)' : 'rgba(245, 158, 11, 0.3)'}`,
                    color: isSearch ? '#fef3c7' : 'var(--color-amber-100)',
                  }}
                >
                  <div
                    className="text-xs mb-2 tracking-widest italic"
                    style={{ color: isSearch ? '#7dd3fc' : '#fcd34d' }}
                  >
                    {isSearch ? '📖 TOME SEARCH' : '🪄 THE ORACLE'}
                  </div>
                  <div className="whitespace-pre-wrap italic">{m.content}</div>
                </div>
                {/* Sources */}
                {m.sources && m.sources.length > 0 && (
                  <div
                    className="rounded-sm p-2 text-xs"
                    style={{
                      background: 'rgba(var(--surface-modal, 20, 12, 6), 0.7)',
                      border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15), 0.5)',
                    }}
                  >
                    <div className="text-amber-600 italic tracking-wider mb-2">⚜ SOURCES FROM THE TOME ⚜</div>
                    <div className="space-y-1">
                      {m.sources.map((s, si) => {
                        const key = `${i}-${si}`;
                        const expanded = expandedSources[key];
                        const sourceLabel = `[${si + 1}] ${s.icon} ${s.typeLabel}`;
                        const preview = s.text.length > 100 ? `${s.text.slice(0, 100)}...` : s.text;
                        return (
                          <div
                            key={si}
                            className="rounded-sm"
                            style={{
                              background: 'rgba(var(--surface-amber, 41, 24, 12), 0.5)',
                              border: '1px solid rgba(var(--surface-amber-strong, 120, 53, 15), 0.4)',
                            }}
                          >
                            <button
                              onClick={() => toggleSource(i, si)}
                              className="w-full text-left p-2 flex items-start gap-2 hover:bg-amber-900/20"
                            >
                              <span className="text-amber-400 font-bold shrink-0">{sourceLabel}</span>
                              <span className="text-amber-100/70 italic flex-1">{expanded ? s.text : preview}</span>
                              <ChevronRight
                                className={`w-3 h-3 text-amber-600 shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex justify-start">
            <div
              className="p-3 rounded-sm"
              style={{
                background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div
        className="rounded-b p-3 flex gap-2"
        style={{
          background: 'rgba(var(--surface-modal, 20, 12, 6), 0.95)',
          border: '2px solid rgba(245, 158, 11, 0.5)',
          borderTop: 'none',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={mode === 'oracle' ? 'Ask the Oracle...' : 'Search the tome...'}
          disabled={loading}
          className="flex-1 p-3 rounded-sm border-2 focus:outline-hidden italic text-amber-50"
          style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)', borderColor: 'rgba(180, 83, 9, 0.5)' }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          className="px-4 py-3 font-bold rounded-sm disabled:opacity-50 flex items-center gap-2 text-amber-950 border-2 border-amber-300 italic"
          style={{
            background: 'linear-gradient(to bottom, #fde047 0%, #f59e0b 100%)',
            boxShadow: '0 0 15px rgba(245, 158, 11, 0.4)',
          }}
        >
          {mode === 'oracle' ? (
            <>
              <Send className="w-4 h-4" /> Speak
            </>
          ) : (
            <>
              <BookOpen className="w-4 h-4" /> Search
            </>
          )}
        </button>
      </div>

      {/* Clear chat confirm */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            ref={clearConfirmRef}
            role="dialog"
            aria-modal="true"
            aria-label="Clear chat confirmation"
            className="rounded-sm max-w-md w-full overflow-hidden flex flex-col relative"
            style={{
              background:
                'linear-gradient(135deg, rgba(var(--surface-danger, 80, 20, 20), 0.95) 0%, rgba(var(--surface-deep, 10, 6, 4), 0.99) 100%)',
              border: '3px double rgba(220, 38, 38, 0.7)',
              boxShadow: '0 0 40px rgba(220, 38, 38, 0.4)',
            }}
          >
            <div className="p-4 border-b border-red-700/50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-red-300 italic flex items-center gap-2">
                <Trash2 className="w-5 h-5" /> Clear Chat History
              </h3>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="p-2 hover:bg-red-900/30 rounded-sm text-red-300"
                aria-label="Cancel clearing chat history"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-amber-100 italic">
                "Erase all messages with the Oracle and Tome Search for this tome? This cannot be undone, brave
                scholar."
              </p>
            </div>
            <div className="p-4 border-t border-red-700/50 flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-sm border-2 border-amber-700 text-amber-200 italic"
                style={{ background: 'rgba(var(--surface-amber, 41, 24, 12), 0.7)' }}
              >
                Cancel
              </button>
              <button
                onClick={clearChat}
                className="flex-1 py-2 font-bold rounded-sm text-amber-50 border-2 border-red-400 italic"
                style={{ background: 'linear-gradient(to bottom, #dc2626 0%, #991b1b 100%)' }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatMode;
