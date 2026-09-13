// Sport/round tag metadata + deterministic team-avatar styling (no image assets).

export interface SportMeta {
  emoji: string;
  color: string;
}

const SPORTS: Record<string, SportMeta> = {
  football: { emoji: "⚽", color: "#16a34a" },
  soccer: { emoji: "⚽", color: "#16a34a" },
  basketball: { emoji: "🏀", color: "#ea580c" },
  cricket: { emoji: "🏏", color: "#0891b2" },
  volleyball: { emoji: "🏐", color: "#ca8a04" },
  tennis: { emoji: "🎾", color: "#65a30d" },
  badminton: { emoji: "🏸", color: "#7c3aed" },
  hockey: { emoji: "🏑", color: "#be123c" },
  "table tennis": { emoji: "🏓", color: "#db2777" },
  chess: { emoji: "♟️", color: "#475569" },
  athletics: { emoji: "🏃", color: "#0d9488" },
  kabaddi: { emoji: "🤼", color: "#c026d3" },
  esports: { emoji: "🎮", color: "#4f46e5" },
};

export const SPORT_OPTIONS = Object.keys(SPORTS).filter((s) => s !== "soccer");

export const ROUND_OPTIONS = [
  "Group",
  "Qualifiers",
  "Round of 16",
  "Quarterfinal",
  "Semifinal",
  "Final",
  "3rd Place",
  "Friendly",
];

export function sportMeta(sport?: string | null): SportMeta {
  if (!sport) return { emoji: "🎯", color: "#6366f1" };
  return SPORTS[sport.toLowerCase()] ?? { emoji: "🎯", color: "#6366f1" };
}

/** Deterministic HSL color from a team name, for its avatar. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 62% 45%)`;
}

/** 1–2 letter initials for a team name. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
