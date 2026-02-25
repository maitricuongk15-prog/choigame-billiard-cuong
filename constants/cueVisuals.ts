type CueIdentity = {
  slug?: string | null;
  color?: string | null;
};

export interface CueVisualTheme {
  bodyColor: string;
  outlineColor: string;
  wrapColor: string;
  buttColor: string;
  ferruleColor: string;
  tipColor: string;
  accentColor: string;
  accentDash: string;
}

const DEFAULT_THEME: CueVisualTheme = {
  bodyColor: "#8B5A2B",
  outlineColor: "#5A3A22",
  wrapColor: "#2C1E16",
  buttColor: "#1B1B1B",
  ferruleColor: "#E5E7EB",
  tipColor: "#2F2F2F",
  accentColor: "#C49A6C",
  accentDash: "0,0",
};

const THEME_BY_SLUG: Record<string, CueVisualTheme> = {
  starter: {
    bodyColor: "#8B5A2B",
    outlineColor: "#5B3A22",
    wrapColor: "#3A2A1A",
    buttColor: "#171717",
    ferruleColor: "#E8E8E8",
    tipColor: "#262626",
    accentColor: "#C49A6C",
    accentDash: "0,0",
  },
  "oak-pro": {
    bodyColor: "#6B4A2F",
    outlineColor: "#4A3221",
    wrapColor: "#1F2937",
    buttColor: "#111827",
    ferruleColor: "#F1F5F9",
    tipColor: "#1F2937",
    accentColor: "#EAB308",
    accentDash: "0,0",
  },
  "carbon-x": {
    bodyColor: "#2A2F36",
    outlineColor: "#0F172A",
    wrapColor: "#111827",
    buttColor: "#020617",
    ferruleColor: "#CBD5E1",
    tipColor: "#0B1220",
    accentColor: "#22D3EE",
    accentDash: "7,5",
  },
  phoenix: {
    bodyColor: "#C0392B",
    outlineColor: "#7F1D1D",
    wrapColor: "#3F1D2E",
    buttColor: "#111827",
    ferruleColor: "#F8FAFC",
    tipColor: "#1E293B",
    accentColor: "#F59E0B",
    accentDash: "10,3",
  },
  "viper-strike": {
    bodyColor: "#14532D",
    outlineColor: "#052E16",
    wrapColor: "#1F2937",
    buttColor: "#0B1324",
    ferruleColor: "#E2E8F0",
    tipColor: "#0A0A0A",
    accentColor: "#A3E635",
    accentDash: "5,4",
  },
  "aurora-balance": {
    bodyColor: "#0EA5E9",
    outlineColor: "#0C4A6E",
    wrapColor: "#1E293B",
    buttColor: "#0F172A",
    ferruleColor: "#F8FAFC",
    tipColor: "#1E293B",
    accentColor: "#E879F9",
    accentDash: "8,4",
  },
  "titanium-z": {
    bodyColor: "#64748B",
    outlineColor: "#334155",
    wrapColor: "#111827",
    buttColor: "#020617",
    ferruleColor: "#E2E8F0",
    tipColor: "#111827",
    accentColor: "#22D3EE",
    accentDash: "4,3",
  },
  "nebula-elite": {
    bodyColor: "#7C3AED",
    outlineColor: "#4C1D95",
    wrapColor: "#1F1147",
    buttColor: "#0B1324",
    ferruleColor: "#F8FAFC",
    tipColor: "#1E1B4B",
    accentColor: "#F43F5E",
    accentDash: "12,4",
  },
};

export function getCueVisualTheme(cue: CueIdentity | null | undefined): CueVisualTheme {
  const slug = cue?.slug ?? "";
  const slugTheme = THEME_BY_SLUG[slug];
  if (slugTheme) return slugTheme;

  const bodyColor = cue?.color || DEFAULT_THEME.bodyColor;
  return {
    ...DEFAULT_THEME,
    bodyColor,
  };
}
