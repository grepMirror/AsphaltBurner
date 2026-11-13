import type { Sport } from '../types'

const iconBase = import.meta.env.BASE_URL

const ICON: Record<Sport, string> = {
  run: `${iconBase}icons/run.png`,
  swim: `${iconBase}icons/swim.png`,
  ride: `${iconBase}icons/ride.png`,
  other: `${iconBase}icons/other.png`,
}

export function SportIcon({ sport, className = 'h-3.5 w-3.5' }: { sport: Sport; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url(${ICON[sport]})`,
        WebkitMaskImage: `url(${ICON[sport]})`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  )
}
