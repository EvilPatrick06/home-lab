import { useState } from 'react'
import {
  CLIMATES,
  type Climate,
  generateWeather as generateRandomWeather,
  SEASONS,
  type Season as WeatherSeason,
  weatherToOverride
} from '../../../../data/weather-tables'
import { useGameStore } from '../../../../stores/use-game-store'

const WEATHER_PRESETS = [
  'Clear',
  'Partly Cloudy',
  'Overcast',
  'Light Rain',
  'Heavy Rain',
  'Thunderstorm',
  'Light Snow',
  'Heavy Snow',
  'Blizzard',
  'Fog',
  'Hail',
  'Extreme Heat',
  'Extreme Cold',
  'Sandstorm',
  'Volcanic Ash'
] as const

const WIND_SPEEDS = ['Calm', 'Light Breeze', 'Moderate', 'Strong', 'Gale', 'Hurricane'] as const

const MECHANICAL_EFFECTS = [
  'Difficult terrain',
  'Disadvantage on Perception',
  'Disadvantage on Ranged Attacks',
  'Lightly Obscured',
  'Heavily Obscured',
  'Fire resistance',
  'Cold vulnerability'
] as const

function fToC(f: number): number {
  return Math.round(((f - 32) * 5) / 9)
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32)
}

export default function WeatherOverridePanel(): JSX.Element {
  const weatherOverride = useGameStore((s) => s.weatherOverride)
  const setWeatherOverride = useGameStore((s) => s.setWeatherOverride)
  const savedWeatherPresets = useGameStore((s) => s.savedWeatherPresets)
  const addSavedWeatherPreset = useGameStore((s) => s.addSavedWeatherPreset)
  const removeSavedWeatherPreset = useGameStore((s) => s.removeSavedWeatherPreset)

  const [weatherMode, setWeatherMode] = useState<'auto' | 'manual'>(weatherOverride ? 'manual' : 'auto')
  const [randomClimate, setRandomClimate] = useState<Climate>('temperate')
  const [randomSeason, setRandomSeason] = useState<WeatherSeason>('summer')
  const [wPreset, setWPreset] = useState(weatherOverride?.preset ?? 'Clear')
  const [wDescription, setWDescription] = useState(weatherOverride?.description ?? '')
  const [wTempUnit, setWTempUnit] = useState<'F' | 'C'>(weatherOverride?.temperatureUnit ?? 'F')
  const [wTemp, setWTemp] = useState(weatherOverride?.temperature ?? 70)
  const [wWind, setWWind] = useState(weatherOverride?.windSpeed ?? 'Calm')
  const [wEffects, setWEffects] = useState<string[]>(weatherOverride?.mechanicalEffects ?? [])
  const [presetSaveName, setPresetSaveName] = useState('')

  function handleToggleEffect(effect: string): void {
    setWEffects((prev) => (prev.includes(effect) ? prev.filter((e) => e !== effect) : [...prev, effect]))
  }

  function applyWeatherOverride(): void {
    if (weatherMode === 'auto') {
      setWeatherOverride(null)
    } else {
      setWeatherOverride({
        description: wDescription,
        temperature: wTemp,
        temperatureUnit: wTempUnit,
        windSpeed: wWind,
        mechanicalEffects: wEffects,
        preset: wPreset
      })
    }
  }

  function handleSavePreset(): void {
    const name = presetSaveName.trim()
    if (!name) return
    addSavedWeatherPreset({
      name,
      description: wDescription,
      temperature: wTemp,
      temperatureUnit: wTempUnit,
      windSpeed: wWind,
      mechanicalEffects: wEffects,
      preset: wPreset
    })
    setPresetSaveName('')
  }

  function handleLoadSavedPreset(preset: (typeof savedWeatherPresets)[number]): void {
    setWPreset(preset.preset ?? 'Clear')
    setWDescription(preset.description)
    setWTemp(preset.temperature ?? 70)
    setWTempUnit(preset.temperatureUnit ?? 'F')
    setWWind(preset.windSpeed ?? 'Calm')
    setWEffects(preset.mechanicalEffects ?? [])
  }

  const tempMin = wTempUnit === 'F' ? -40 : fToC(-40)
  const tempMax = wTempUnit === 'F' ? 130 : fToC(130)

  return (
    <div className="border-t border-gray-800 pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-300">Weather Override</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setWeatherMode('auto')
              setWeatherOverride(null)
            }}
            className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
              weatherMode === 'auto'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
            }`}
          >
            Auto
          </button>
          <button
            onClick={() => setWeatherMode('manual')}
            className={`px-2 py-0.5 text-[10px] rounded cursor-pointer ${
              weatherMode === 'manual'
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
            }`}
          >
            Manual
          </button>
        </div>
      </div>

      {weatherMode === 'manual' && (
        <div className="space-y-3 bg-gray-800/50 rounded-lg p-3">
          {/* Preset Dropdown */}
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Preset</label>
            <select
              value={wPreset}
              onChange={(e) => setWPreset(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200"
            >
              {WEATHER_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Description */}
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Description</label>
            <textarea
              value={wDescription}
              onChange={(e) => setWDescription(e.target.value)}
              placeholder="A thick fog rolls in from the marshlands..."
              rows={2}
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200 resize-none"
            />
          </div>

          {/* Temperature Slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500 uppercase tracking-wide">
                Temperature: {wTemp}
                {'\u00b0'}
                {wTempUnit}
              </label>
              <button
                onClick={() => {
                  if (wTempUnit === 'F') {
                    setWTempUnit('C')
                    setWTemp(fToC(wTemp))
                  } else {
                    setWTempUnit('F')
                    setWTemp(cToF(wTemp))
                  }
                }}
                className="px-1.5 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer"
              >
                {'\u00b0'}
                {wTempUnit === 'F' ? 'C' : 'F'}
              </button>
            </div>
            <input
              type="range"
              min={tempMin}
              max={tempMax}
              value={wTemp}
              onChange={(e) => setWTemp(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-[9px] text-gray-600">
              <span>
                {tempMin}
                {'\u00b0'}
                {wTempUnit}
              </span>
              <span>
                {tempMax}
                {'\u00b0'}
                {wTempUnit}
              </span>
            </div>
          </div>

          {/* Wind Speed */}
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Wind Speed</label>
            <select
              value={wWind}
              onChange={(e) => setWWind(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200"
            >
              {WIND_SPEEDS.map((ws) => (
                <option key={ws} value={ws}>
                  {ws}
                </option>
              ))}
            </select>
          </div>

          {/* Mechanical Effects Checkboxes */}
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Mechanical Effects</label>
            <div className="grid grid-cols-2 gap-1">
              {MECHANICAL_EFFECTS.map((effect) => (
                <label key={effect} className="flex items-center gap-1.5 text-[11px] text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wEffects.includes(effect)}
                    onChange={() => handleToggleEffect(effect)}
                    className="accent-amber-500 w-3 h-3"
                  />
                  {effect}
                </label>
              ))}
            </div>
          </div>

          {/* Random Weather Generator */}
          <div className="border-t border-gray-700 pt-2">
            <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">
              Generate Random Weather
            </label>
            <div className="flex items-center gap-2">
              <select
                value={randomClimate}
                onChange={(e) => setRandomClimate(e.target.value as Climate)}
                className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200"
              >
                {CLIMATES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <select
                value={randomSeason}
                onChange={(e) => setRandomSeason(e.target.value as WeatherSeason)}
                className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200"
              >
                {SEASONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const weather = generateRandomWeather(randomClimate, randomSeason)
                  const override = weatherToOverride(weather)
                  setWPreset(override.preset)
                  setWDescription(override.description)
                  setWTemp(override.temperature)
                  setWTempUnit('F')
                  setWWind(override.windSpeed)
                  setWEffects(override.mechanicalEffects)
                }}
                className="px-3 py-1 text-xs bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded text-purple-300 cursor-pointer whitespace-nowrap"
              >
                Roll
              </button>
            </div>
          </div>

          {/* Apply + Save as Preset */}
          <div className="flex items-center gap-2">
            <button
              onClick={applyWeatherOverride}
              className="px-3 py-1.5 text-xs bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 rounded text-amber-300 cursor-pointer"
            >
              Apply Override
            </button>
            <div className="flex items-center gap-1 flex-1">
              <input
                type="text"
                value={presetSaveName}
                onChange={(e) => setPresetSaveName(e.target.value)}
                placeholder="Preset name..."
                className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded text-gray-200"
              />
              <button
                onClick={handleSavePreset}
                disabled={!presetSaveName.trim()}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>

          {/* Saved Presets */}
          {savedWeatherPresets.length > 0 && (
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Saved Presets</label>
              <div className="flex flex-wrap gap-1">
                {savedWeatherPresets.map((sp) => (
                  <div key={sp.name} className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleLoadSavedPreset(sp)}
                      className="px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-600 rounded-l text-gray-300 cursor-pointer"
                    >
                      {sp.name}
                    </button>
                    <button
                      onClick={() => removeSavedWeatherPreset(sp.name)}
                      className="px-1 py-0.5 text-[10px] bg-gray-700 hover:bg-red-700/50 rounded-r text-gray-500 hover:text-red-300 cursor-pointer"
                      title="Remove preset"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
