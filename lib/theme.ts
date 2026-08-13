const LIGHT_TEXT = "#FFFFFF";
const DARK_TEXT = "#14212A";

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) return 0;

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: number, second: number): number {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableTextColor(background: string): string {
  const backgroundLuminance = relativeLuminance(background);
  const lightContrast = contrastRatio(backgroundLuminance, 1);
  const darkContrast = contrastRatio(
    backgroundLuminance,
    relativeLuminance(DARK_TEXT),
  );

  return lightContrast >= darkContrast ? LIGHT_TEXT : DARK_TEXT;
}
