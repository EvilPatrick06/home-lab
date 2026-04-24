interface FloorSelectorProps {
  floors: Array<{ id: string; name: string }>
  currentFloor: number
  onFloorChange: (floorIndex: number) => void
  disabled?: boolean
}

export default function FloorSelector({
  floors,
  currentFloor,
  onFloorChange,
  disabled
}: FloorSelectorProps): JSX.Element | null {
  if (floors.length <= 1) return null

  return (
    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-20">
      {floors.map((floor, index) => (
        <button
          key={floor.id}
          onClick={() => onFloorChange(index)}
          disabled={disabled}
          className={`px-2 py-1.5 text-xs font-medium rounded border transition-colors ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          } ${
            currentFloor === index
              ? 'bg-amber-600 border-amber-500 text-white'
              : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
          }`}
          title={floor.name}
        >
          {floor.name}
        </button>
      ))}
    </div>
  )
}
