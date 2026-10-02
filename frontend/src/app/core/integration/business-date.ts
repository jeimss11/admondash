export interface BusinessLocaleProfile {
  country: string;
  locale: string;
  currency: string;
  timeZone: string;
}

/** Initial profile. A later per-business resolver can replace this default. */
export const DEFAULT_BUSINESS_LOCALE: BusinessLocaleProfile = {
  country: 'CO',
  locale: 'es-CO',
  currency: 'COP',
  timeZone: 'America/Bogota',
};

/**
 * Civil operational date, independent from the browser's own timezone.
 * This is not an audit timestamp and must not replace Firestore server time.
 */
export function businessDate(
  date = new Date(),
  profile: BusinessLocaleProfile = DEFAULT_BUSINESS_LOCALE
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: profile.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  if (!year || !month || !day) throw new Error('No fue posible calcular la fecha de negocio.');
  return `${year}-${month}-${day}`;
}

/** Start of the current operational month for the supplied business profile. */
export function businessMonthStart(
  date = new Date(),
  profile: BusinessLocaleProfile = DEFAULT_BUSINESS_LOCALE
): string {
  return `${businessDate(date, profile).slice(0, 7)}-01`;
}

/** Presentation only; the persisted operational key remains `yyyy-MM-dd`. */
export function businessDisplayDate(
  date = new Date(),
  profile: BusinessLocaleProfile = DEFAULT_BUSINESS_LOCALE
): string {
  return new Intl.DateTimeFormat(profile.locale, {
    timeZone: profile.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Backward-compatible name for the initial Colombia deployment. */
export function colombiaBusinessDate(date = new Date()): string {
  return businessDate(date, DEFAULT_BUSINESS_LOCALE);
}

/** Returns a prior Colombian civil date without relying on the browser's timezone. */
export function colombiaBusinessDateDaysAgo(days: number, now = new Date()): string {
  if (!Number.isInteger(days) || days < 0) throw new Error('El desplazamiento de fecha no es válido.');
  return colombiaBusinessDate(new Date(now.getTime() - days * 86_400_000));
}
