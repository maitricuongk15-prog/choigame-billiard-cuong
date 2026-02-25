const AVATAR_EMOJIS = [
  "😎",
  "😊",
  "🤠",
  "🧠",
  "😺",
  "🦊",
  "🐯",
  "🐼",
  "🐨",
  "🐸",
  "🦁",
  "🐵",
];

export function getAvatarEmoji(seed: string): string {
  if (!seed) return "😎";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_EMOJIS.length;
  return AVATAR_EMOJIS[index];
}

export function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const url = value.trim();
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return null;
}

