export const meta = {
  name: 'solo-ai-dm-hang-diagnosis',
  description: 'Find the real root cause of the solo Ollama AI-DM 5-minute hang → timeout (no tokens)',
  phases: [
    { title: 'Investigate', detail: 'parallel agents, one per hypothesis' },
    { title: 'Refute', detail: 'adversarially verify the leading root cause' }
  ]
}

const SYMPTOM = `
USER BUG (reproducible, live): Fresh SOLO AI-DM campaign with a local Ollama provider.
- The opening scene is NEVER set automatically on campaign start.
- When the user types, chat shows "AI DM is typing" / status "AI responding" for AT LEAST 5 MINUTES.
- No tokens ever appear. Eventually chat shows "AI DM error: AI response timed out" and status returns to green "AI ready".
- Ollama IS installed, running, and up to date; the chosen model IS installed and up to date.
So: Ollama is reachable and has the model, but the chat request produces zero output for ~5 min then times out.

KEY CODE FACTS (verify, don't assume):
- dnd-app/src/main/ai/ollama-client.ts:71 wraps the ENTIRE streaming fetch in AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS).
- dnd-app/src/main/ai/llm-provider.ts defines PROVIDER_REQUEST_TIMEOUT_MS (≈90_000).
- dnd-app/src/main/ai/ai-service.ts streamWithRetry does up to 3 attempts (maxRetries=2) with getRetryDelay backoff (1s,2s). startChat builds context then calls provider.streamChat via streamChatRetryable.
- The system prompt + context are assembled in prompt-assembler.ts, context-builder.ts, token-budget.ts, dm-system-prompt.ts (DM_TOOLBOX_CONTEXT, PLANAR_RULES_CONTEXT), prompt-sections/*.
- Renderer safety timeout: src/renderer/src/stores/use-ai-dm-store.ts uses STREAM_SAFETY_TIMEOUT_MS / STREAM_SAFETY_THRESHOLD_MS (constants/app-constants.ts), streamStartTime, handleStreamStatus.
- Scene-prep: ai-service.ts (scenePrepStatus) + LobbyPage.tsx.

LEADING HYPOTHESIS to evaluate: On a CPU laptop, the assembled prompt (huge DM system prompt + RAG context) is so large that Ollama's prompt-evaluation/prefill phase exceeds the 90s hard timeout BEFORE the first token is generated. AbortSignal.timeout kills the request mid-prefill; streamWithRetry retries 3× (each re-running prefill from scratch) → ~5 min → "timed out", zero tokens. Same path → scene-prep also fails.`

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hypothesis', 'verdict', 'evidence', 'rootCauseLikelihood', 'proposedFix'],
  properties: {
    hypothesis: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'partial', 'refuted', 'inconclusive'] },
    evidence: { type: 'string', description: 'file:line proof from reading the code' },
    rootCauseLikelihood: { type: 'string', enum: ['high', 'medium', 'low'] },
    proposedFix: { type: 'string', description: 'concrete code change with file:symbol' }
  }
}

const HYPOTHESES = [
  { key: 'prefill-timeout', prompt: 'Evaluate the LEADING hypothesis: the assembled prompt is large enough that Ollama prompt-prefill on CPU exceeds the 90s hard timeout before the first token. Find the actual size of the system prompt + context sent to Ollama for (a) the opening scene-prep and (b) a normal player message. Read prompt-assembler.ts, context-builder.ts, token-budget.ts (TOKEN_BUDGETS), dm-system-prompt.ts, prompt-sections/*. Estimate total prompt tokens. Confirm ollama-client.ts applies AbortSignal.timeout to the WHOLE request (so a long prefill with no bytes yet WILL be aborted). Confirm the timeout is NOT inactivity/first-token based. Is there ANY per-provider prompt-size reduction for local Ollama? Report the realistic prompt token count and whether CPU prefill of it can exceed 90s.' },
  { key: 'timeout-retry-math', prompt: 'Trace the timeout + retry math. Confirm PROVIDER_REQUEST_TIMEOUT_MS value, that ollama-client uses it as a hard AbortSignal.timeout on the streaming fetch, that streamWithRetry runs N attempts with what backoff, and compute the total wall-clock before onError fires. Does it equal ~5 min? Does each retry re-issue the full request (re-running prefill)? Does streamChatRetryable reject a pre-first-token timeout (making it retryable) vs resolve? Is retrying a prefill-timeout ever able to succeed, or is it pure waste? Propose the precise timeout/retry change (e.g. inactivity-based timeout, longer first-token grace, no-retry-on-timeout).' },
  { key: 'renderer-safety-timeout', prompt: 'Why does the renderer NOT surface a timeout at its own STREAM_SAFETY_TIMEOUT_MS (check the value in constants/app-constants.ts) — the user waits ~5 min, not ~2 min? In src/renderer/src/stores/use-ai-dm-store.ts trace the safety timeout: is streamStartTime/the timer reset by incoming stream STATUS messages (loading_model/model_switched) or heartbeats, so it never fires while the main process is still retrying? Is the safety timeout even armed for scene-prep? Report exactly why the 5-min main-process path wins over the renderer safety net, and how the renderer should bail earlier with an actionable message.' },
  { key: 'scene-prep-silent', prompt: 'Find the auto opening-scene generation on solo campaign start (ai-service.ts scenePrepStatus + setScenePrepStatus, LobbyPage.tsx, use-ai-dm-store, use-game-effects). Confirm it uses the SAME Ollama streaming path (so it dies the same way), and determine whether its failure is surfaced to the user or silently swallowed (explaining "scene is never set on its own"). Propose how scene-prep should report a cold-model/timeout failure.' },
  { key: 'alternatives-adversarial', prompt: 'ADVERSARIAL: try to prove the root cause is NOT prefill-timeout but something simpler. Check: (1) does an empty/wrong model name reach the Ollama request on a FRESH config (currentConfig.model defaulted to "" after de-hardcoding) — trace resolveOllamaModel and whether it always yields a valid installed model; (2) is the Ollama base URL correct (ollama-constants OLLAMA_BASE_URL) and is the OpenAI-compat path /v1/chat/completions right; (3) is the SSE parser in ollama-client correct for Ollama /v1/chat/completions streaming, or could tokens arrive but be dropped (so it only LOOKS like no output); (4) could the active provider be misselected (a cloud provider with no key) causing a different hang. Report which (if any) of these is the real cause with file:line, else confirm they are ruled out.' }
]

phase('Investigate')
const findings = await parallel(
  HYPOTHESES.map((h) => () =>
    agent(`${SYMPTOM}\n\nINVESTIGATE: ${h.prompt}\n\nRead the actual code. Ground every claim in file:line. Return your verdict.`, {
      label: `investigate:${h.key}`,
      phase: 'Investigate',
      agentType: 'Explore',
      schema: FINDING_SCHEMA
    })
  )
)

const confirmed = findings.filter(Boolean).filter((f) => f.verdict === 'confirmed' || f.rootCauseLikelihood === 'high')

phase('Refute')
const verdicts = await parallel(
  confirmed.map((f) => () =>
    agent(`${SYMPTOM}\n\nA prior investigator concluded:\nhypothesis: ${f.hypothesis}\nevidence: ${f.evidence}\nproposedFix: ${f.proposedFix}\n\nADVERSARIALLY VERIFY by opening the cited files. Try to REFUTE that this is the root cause (or that the fix is wrong/incomplete). Confirm the fix would actually let a slow-CPU cold-prefill produce tokens instead of timing out, WITHOUT breaking the abort/cancel path or the 3 retries' usefulness for genuine transient errors. Default real=false if you cannot confirm.`, {
      label: `refute:${f.hypothesis.slice(0, 28)}`,
      phase: 'Refute',
      agentType: 'Explore',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['real', 'reason', 'finalFix'],
        properties: {
          real: { type: 'boolean' },
          reason: { type: 'string' },
          finalFix: { type: 'string', description: 'the verified, concrete fix (file:symbol + change)' }
        }
      }
    })
  )
)

return {
  findings,
  confirmedRootCauses: verdicts.filter(Boolean).filter((v) => v.real)
}
