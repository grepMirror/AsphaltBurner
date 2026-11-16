export function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-md bg-white/5 p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded px-2.5 py-1.5 text-xs sm:py-1 ${value === option.id ? 'bg-white/15 text-white' : 'text-white/55'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
