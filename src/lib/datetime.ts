export function parseClientDatetime(
  datetime?: string,
  timezoneOffsetMinutes?: number
): Date | null {
  if (!datetime) return null;

  const includesTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(datetime);
  if (includesTimezone) {
    const directDate = new Date(datetime);
    return Number.isNaN(directDate.getTime()) ? null : directDate;
  }

  const match = datetime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second = "0"] = match;
  const offset = Number.isFinite(timezoneOffsetMinutes)
    ? Number(timezoneOffsetMinutes)
    : 0;

  const utcMs =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ) +
    offset * 60_000;

  return new Date(utcMs);
}
