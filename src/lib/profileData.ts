import { DEFAULT_PROFILE_ID } from './profiles'

/** Planner keys. The first profile keeps the key used before planner data was kept per profile. */
export const PLAN_KEY = 'asphaltburner.plan.v2'
export const PLANS_KEY = 'asphaltburner.plans.v1'
export const BLOCKS_KEY = 'asphaltburner.blocks.v1'
export const TOMBSTONES_KEY = 'asphaltburner.tombstones.v1'

/** Fired after a local save of a profile's planner data or settings. Drive sync listens to it. */
export const CHANGE_EVENT = 'asphaltburner:changed'

export function profileKey(base: string, profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? base : `${base}:${profileId}`
}

export function noteChange(profileId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<string>(CHANGE_EVENT, { detail: profileId }))
}

/** Planner data of a deleted profile. Its activities and archive are removed by the caller. */
export function removePlannerData(profileId: string): void {
  for (const base of [PLAN_KEY, PLANS_KEY, BLOCKS_KEY, TOMBSTONES_KEY]) {
    try {
      localStorage.removeItem(profileKey(base, profileId))
    } catch {
      /* nothing stored */
    }
  }
}
