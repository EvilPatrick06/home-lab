export default function SectionBanner({ label }: { label: string }): JSX.Element {
  return (
    <div className="bg-surface-2/80 px-4 py-1.5">
      <span className="text-xs font-bold tracking-widest text-accent uppercase">{label}</span>
    </div>
  )
}
