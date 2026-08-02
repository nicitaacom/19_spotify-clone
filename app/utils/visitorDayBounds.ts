const SECONDS_PER_DAY = 24 * 60 * 60

/**
 * Seconds elapsed since midnight in the visitor's own timezone, or null when the timezone argument
 * names no zone `Intl` knows. The argument reaches the server from the browser, so an edited value
 * used to throw a RangeError out of `Intl` before any row was written - callers fall back to a
 * 24h window instead.
 */
function getSecondsSinceVisitorMidnight(timezone: string | undefined): number | null {
  if (!timezone) return null

  try {
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date())
    const timeValues = new Map(timeParts.map(part => [part.type, Number(part.value)]))
    const secondsSinceMidnight =
      (timeValues.get("hour") ?? 0) * 60 * 60 + (timeValues.get("minute") ?? 0) * 60 + (timeValues.get("second") ?? 0)

    return Number.isNaN(secondsSinceMidnight) ? null : secondsSinceMidnight
  } catch {
    return null
  }
}

/**
 * Midnight ahead of the visitor, in their own timezone - the moment the cookie and the IP -> deviceId
 * Redis key both expire, so they end at the same moment the once-per-day dedup window does.
 */
export function getVisitorDayEnd(timezone: string | undefined): Date {
  const secondsSinceMidnight = getSecondsSinceVisitorMidnight(timezone)
  if (secondsSinceMidnight === null) return new Date(Date.now() + SECONDS_PER_DAY * 1000)

  return new Date(Date.now() + (SECONDS_PER_DAY - secondsSinceMidnight) * 1000)
}

/** Midnight behind the visitor - the start of the window `utm_stats` is checked for an existing row in. */
export function getVisitorDayStart(timezone: string | undefined): Date {
  const secondsSinceMidnight = getSecondsSinceVisitorMidnight(timezone)
  if (secondsSinceMidnight === null) return new Date(Date.now() - SECONDS_PER_DAY * 1000)

  return new Date(Date.now() - secondsSinceMidnight * 1000)
}
