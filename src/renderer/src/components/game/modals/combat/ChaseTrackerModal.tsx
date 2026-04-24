import { useEffect, useState } from 'react'
import { load5eChaseTables } from '../../../../services/data-provider'
import { logger } from '../../../../utils/logger'
import ChaseControls, { type Participant } from './ChaseControls'
import ChaseMap from './ChaseMap'

interface ChaseTrackerModalProps {
  onClose: () => void
  onBroadcastResult: (message: string) => void
}

type ComplicationType = 'urban' | 'wilderness'

interface ChaseTableData {
  urban?: string[]
  wilderness?: string[]
}

const FALLBACK_URBAN_COMPLICATIONS: string[] = [
  'No complication.',
  'A large cart blocks the way. DC 10 Dexterity (Acrobatics) to get past, or lose 1 zone.',
  'A crowd fills the street. DC 10 Strength (Athletics) to push through, or lose 1 zone.',
  'A dog runs underfoot. DC 12 Dexterity saving throw or fall prone, losing 1 zone.',
  'A low-hanging sign. DC 10 Dexterity (Acrobatics) to duck, or take 1d4 bludgeoning damage.',
  'A crumbling staircase. DC 10 Dexterity (Acrobatics) to navigate, or fall to ground level.',
  'You run through a swarm of insects. DC 12 Constitution saving throw or blinded until end of next turn.',
  'A guard steps in your path. DC 12 Charisma (Persuasion) to talk past, or lose 1 zone.',
  'You run into a dead end and must backtrack. Lose 1 zone.',
  'A window or door blocks the path. DC 10 Strength to bash through, or lose 1 zone.',
  'A bridge or rooftop gap. DC 10 Dexterity (Acrobatics) to leap, or fall 1d6 x 5 feet.',
  'No complication.'
]

const FALLBACK_WILDERNESS_COMPLICATIONS: string[] = [
  'No complication.',
  'Your path takes you through a rough patch. DC 10 Dexterity (Acrobatics) or lose 1 zone.',
  'A stream or ravine blocks your path. DC 10 Strength (Athletics) to cross, or lose 1 zone.',
  'Uneven ground. DC 10 Dexterity saving throw or fall prone, losing 1 zone.',
  'Your path goes through a briar patch. 1d4 piercing damage and DC 10 Dexterity to avoid losing 1 zone.',
  'You run through a swarm of insects. DC 12 Constitution saving throw or blinded until end of next turn.',
  'A root or rock trips you. DC 10 Dexterity saving throw or take 1d4 bludgeoning and fall prone.',
  "You blunder into a hunter's trap. DC 14 Dexterity saving throw or be restrained (DC 12 Strength to escape).",
  'You are caught in a stampede of animals. DC 12 Dexterity saving throw or take 1d6 bludgeoning and be knocked prone.',
  'A low branch blocks your path. DC 10 Dexterity (Acrobatics) to duck, or take 1d6 bludgeoning.',
  'A flock of birds scatters around you. DC 10 Wisdom (Perception) to not lose track; lose 1 zone on failure.',
  'No complication.'
]

const MAX_ZONES = 10
const MAX_ROUNDS = 10
const ESCAPE_DISTANCE = 3

export default function ChaseTrackerModal({ onClose, onBroadcastResult }: ChaseTrackerModalProps): JSX.Element {
  const [participants, setParticipants] = useState<Participant[]>([
    { id: crypto.randomUUID(), name: 'Quarry', position: 3, speed: 30, dashesUsed: 0, conModifier: 1, isQuarry: true },
    {
      id: crypto.randomUUID(),
      name: 'Pursuer 1',
      position: 0,
      speed: 30,
      dashesUsed: 0,
      conModifier: 1,
      isQuarry: false
    }
  ])
  const [currentRound, setCurrentRound] = useState(1)
  const [activeIndex, setActiveIndex] = useState(0)
  const [complicationType, setComplicationType] = useState<ComplicationType>('urban')
  const [currentComplication, setCurrentComplication] = useState<string | null>(null)
  const [chaseTables, setChaseTables] = useState<ChaseTableData | null>(null)
  const [chaseEnded, setChaseEnded] = useState(false)
  const [endMessage, setEndMessage] = useState('')

  useEffect(() => {
    load5eChaseTables()
      .then((data) => setChaseTables(data as unknown as ChaseTableData))
      .catch((e) => logger.warn('[ChaseTracker] Failed to load chase tables', e))
  }, [])

  const getComplications = (): string[] => {
    if (chaseTables?.[complicationType]) {
      return chaseTables[complicationType]!
    }
    return complicationType === 'urban' ? FALLBACK_URBAN_COMPLICATIONS : FALLBACK_WILDERNESS_COMPLICATIONS
  }

  const rollComplication = (): string => {
    const table = getComplications()
    const roll = Math.floor(Math.random() * table.length)
    return table[roll]
  }

  const getFreeDashes = (conMod: number): number => Math.max(1, 3 + conMod)

  const moveParticipant = (id: string, zones: number): void => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, position: Math.max(0, Math.min(MAX_ZONES, p.position + zones)) } : p))
    )
  }

  const addParticipant = (name: string, conMod: number, isQuarry: boolean): void => {
    setParticipants((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        position: isQuarry ? 3 : 0,
        speed: 30,
        dashesUsed: 0,
        conModifier: conMod,
        isQuarry
      }
    ])
  }

  const removeParticipant = (id: string): void => {
    setParticipants((prev) => prev.filter((p) => p.id !== id))
    if (activeIndex >= participants.length - 1) {
      setActiveIndex(Math.max(0, participants.length - 2))
    }
  }

  const handleDash = (id: string): void => {
    const p = participants.find((p) => p.id === id)
    if (!p) return
    const freeDashes = getFreeDashes(p.conModifier)
    const newDashCount = p.dashesUsed + 1

    setParticipants((prev) => prev.map((pp) => (pp.id === id ? { ...pp, dashesUsed: newDashCount } : pp)))

    if (newDashCount > freeDashes) {
      onBroadcastResult(
        `${p.name} Dashes (${newDashCount}/${freeDashes} free)! DC 10 CON save required or gain 1 Exhaustion.`
      )
    } else {
      onBroadcastResult(`${p.name} Dashes (${newDashCount}/${freeDashes} free).`)
    }
    moveParticipant(id, 1)
  }

  const handleMove = (id: string): void => {
    const p = participants.find((p) => p.id === id)
    if (!p) return
    const zones = Math.max(1, Math.floor(p.speed / 30))
    moveParticipant(id, zones)

    const comp = rollComplication()
    setCurrentComplication(comp)
    onBroadcastResult(`${p.name} moves ${zones} zone(s). Complication: ${comp}`)
  }

  const updateSpeed = (id: string, speed: number): void => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, speed: Math.max(0, speed) } : p)))
  }

  const updateConModifier = (id: string, conMod: number): void => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, conModifier: conMod } : p)))
  }

  const nextTurn = (): void => {
    const quarries = participants.filter((p) => p.isQuarry)
    const pursuers = participants.filter((p) => !p.isQuarry)

    for (const quarry of quarries) {
      const closestPursuer = pursuers.reduce(
        (min, p) => Math.min(min, Math.abs(quarry.position - p.position)),
        Infinity
      )
      if (closestPursuer >= ESCAPE_DISTANCE) {
        setChaseEnded(true)
        setEndMessage(`${quarry.name} escaped! The quarry got ${closestPursuer} zones ahead.`)
        onBroadcastResult(`Chase ended: ${quarry.name} escaped!`)
        return
      }
      if (closestPursuer === 0) {
        setChaseEnded(true)
        setEndMessage(`${quarry.name} was caught!`)
        onBroadcastResult(`Chase ended: ${quarry.name} was caught!`)
        return
      }
    }

    const nextIdx = activeIndex + 1
    if (nextIdx >= participants.length) {
      const nextRound = currentRound + 1
      if (nextRound > MAX_ROUNDS) {
        setChaseEnded(true)
        setEndMessage('Chase ended after 10 rounds. The quarry escaped!')
        onBroadcastResult('Chase ended after 10 rounds. The quarry escaped!')
        return
      }
      setCurrentRound(nextRound)
      setActiveIndex(0)
    } else {
      setActiveIndex(nextIdx)
    }
    setCurrentComplication(null)
  }

  const resetChase = (): void => {
    setChaseEnded(false)
    setEndMessage('')
    setCurrentRound(1)
    setActiveIndex(0)
    setCurrentComplication(null)
    setParticipants((prev) =>
      prev.map((p) => ({
        ...p,
        position: p.isQuarry ? 3 : 0,
        dashesUsed: 0
      }))
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-amber-400">Chase Tracker</h2>
            <span className="text-xs text-gray-400">
              Round {currentRound}/{MAX_ROUNDS}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Complication Type */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-400">Setting:</label>
            <button
              onClick={() => setComplicationType('urban')}
              className={`px-3 py-1 text-xs rounded border ${
                complicationType === 'urban'
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
              }`}
            >
              Urban
            </button>
            <button
              onClick={() => setComplicationType('wilderness')}
              className={`px-3 py-1 text-xs rounded border ${
                complicationType === 'wilderness'
                  ? 'bg-amber-600 border-amber-500 text-white'
                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
              }`}
            >
              Wilderness
            </button>
          </div>

          {/* Distance Track */}
          <ChaseMap participants={participants} maxZones={MAX_ZONES} />

          {/* Chase Ended */}
          {chaseEnded && (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg p-3 text-center">
              <div className="text-amber-400 font-bold text-sm">{endMessage}</div>
              <button
                onClick={resetChase}
                className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded"
              >
                Reset Chase
              </button>
            </div>
          )}

          {/* Current Complication */}
          {currentComplication && !chaseEnded && (
            <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3">
              <div className="text-xs text-purple-400 font-semibold mb-1">Complication</div>
              <div className="text-sm text-purple-200">{currentComplication}</div>
            </div>
          )}

          {/* Participant Controls */}
          <ChaseControls
            participants={participants}
            activeIndex={activeIndex}
            chaseEnded={chaseEnded}
            getFreeDashes={getFreeDashes}
            onMove={handleMove}
            onDash={handleDash}
            onUpdateSpeed={updateSpeed}
            onUpdateConModifier={updateConModifier}
            onRemove={removeParticipant}
            onAddParticipant={addParticipant}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-700">
          <div className="text-xs text-gray-500">
            Escape at {ESCAPE_DISTANCE}+ zones apart. Chase ends after {MAX_ROUNDS} rounds.
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded"
            >
              Close
            </button>
            {!chaseEnded && (
              <button
                onClick={nextTurn}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-sm rounded font-medium"
              >
                Next Turn
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
