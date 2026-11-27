/**
 * One width for every page on a desktop, so the header, the planner, the calendar, the load and the profile line up.
 * PAGE_BOX is the page with its side padding, PAGE_INNER the content inside a page that has its own padding.
 */
export const PAGE_BOX = 'mx-auto w-full max-w-[1264px] px-4 sm:px-8'
export const PAGE_INNER = 'mx-auto w-full max-w-[1200px]'
/** One type style for page titles and sub-tab titles (Load, Activities, Profile tabs, Planner tabs). */
export const TITLE = 'font-display text-2xl font-semibold tracking-tight'
/** Sub-tab labels (Profile, Planner). One step under the page titles so the tabs never read bigger than the title. */
export const SUBTAB = 'font-display text-xl font-semibold tracking-tight'
/**
 * Class of a sub-tab button. On a phone it is a bordered pill so the icon reads as a button; from `sm` up it is the plain text tab.
 */
export function subtabClass(on: boolean): string {
  return [
    SUBTAB,
    'flex shrink-0 items-center gap-2.5 rounded-full px-3.5 py-2 transition-colors sm:rounded-none sm:px-0',
    on
      ? 'bg-white/12 text-white shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_0_0_1px_rgba(255,255,255,0.12)] sm:bg-transparent sm:shadow-none sm:[box-shadow:none]'
      : 'text-white/55 hover:text-white',
  ].join(' ')
}
/** Sub-tab row. On a phone it is a segmented control (one track, the lit segment floats in it); from `sm` up it is a plain text row. */
export const SUBTAB_ROW = 'flex gap-1 overflow-x-auto self-start rounded-full bg-white/[0.04] p-1 sm:flex sm:gap-5 sm:rounded-none sm:bg-transparent sm:p-0'
/** Icon box of a sub-tab: 24px on a phone, 20px from `sm` up. */
export const SUBTAB_ICON = 'inline-flex h-6 w-6 shrink-0 items-center justify-center [&>svg]:h-6 [&>svg]:w-6 sm:h-5 sm:w-5 sm:[&>svg]:h-5 sm:[&>svg]:w-5'
/** Lit LED glow for a title icon. Same look as the sub-tab LEDs. */
export const LED_SKY = 'text-[#38bdf8] drop-shadow-[0_0_6px_rgba(56,189,248,0.95)]'
export const LED_GREEN = 'text-[#4ade80] drop-shadow-[0_0_6px_rgba(74,222,128,0.95)]'
