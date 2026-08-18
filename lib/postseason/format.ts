const EPSILON = 0.001;

export function cleanGamesValue(value: number): number {
  return Math.abs(value) <= EPSILON || Object.is(value, -0) ? 0 : value;
}

export function formatGamesValue(
  value: number,
  options: { absolute?: boolean; signed?: boolean } = {},
): string {
  const cleaned = cleanGamesValue(value);
  const displayed = options.absolute ? Math.abs(cleaned) : cleaned;
  if (options.signed && displayed > 0) return `+${displayed}`;
  return `${displayed}`;
}

export function formatGameCount(
  value: number,
  options: { absolute?: boolean; signed?: boolean } = {},
): string {
  const displayed = options.absolute ? Math.abs(cleanGamesValue(value)) : cleanGamesValue(value);
  return `${formatGamesValue(value, options)} ${Math.abs(displayed) === 1 ? "game" : "games"}`;
}
