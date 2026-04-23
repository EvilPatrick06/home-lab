interface ProficiencyIndicator5eProps {
  proficient: boolean
  expertise?: boolean
}

export default function ProficiencyIndicator5e({ proficient, expertise }: ProficiencyIndicator5eProps): JSX.Element {
  return (
    <div className="flex items-center gap-0.5">
      <span
        className={`w-2.5 h-2.5 rounded-full border ${
          proficient
            ? expertise
              ? 'bg-amber-400 border-amber-400'
              : 'bg-amber-500 border-amber-500'
            : 'border-gray-600'
        }`}
      />
      {expertise && <span className="w-2.5 h-2.5 rounded-full border bg-amber-400 border-amber-400" />}
    </div>
  )
}
