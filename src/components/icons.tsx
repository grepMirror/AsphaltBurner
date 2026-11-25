type IconProps = { size?: number; className?: string }

/** Simplified three-colour Drive mark drawn here, not Google's artwork. */
export function DriveIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon points="8,3 12,10 5.5,20 2,14" fill="#0F9D58" />
      <polygon points="8,3 16,3 22,14 15,14" fill="#FFCD40" />
      <polygon points="5.5,20 18.5,20 22,14 15,14 12,10" fill="#4285F4" />
    </svg>
  )
}

/** Generic sports watch, not the Garmin logo. */
export function GarminIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="7" y="6" width="10" height="12" rx="3" />
      <path d="M9 6l.7-3h4.6L15 6M9 18l.7 3h4.6l.7-3M12 10v2.2l1.4 1" />
    </svg>
  )
}

export function RefreshIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
    </svg>
  )
}

export function FolderIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
