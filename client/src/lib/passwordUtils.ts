// ─── Password Strength ───────────────────────────────────────────────────────

export type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

export interface StrengthResult {
  level: StrengthLevel;
  score: number; // 0-100
  label: string;
  color: string;
  suggestions: string[];
}

export function checkStrength(password: string): StrengthResult {
  if (!password) return { level: 'weak', score: 0, label: 'No password', color: '#ef4444', suggestions: [] };

  let score = 0;
  const suggestions: string[] = [];

  if (password.length >= 8)  score += 20; else suggestions.push('Use at least 8 characters');
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;
  if (/[a-z]/.test(password)) score += 10; else suggestions.push('Add lowercase letters');
  if (/[A-Z]/.test(password)) score += 15; else suggestions.push('Add uppercase letters');
  if (/[0-9]/.test(password)) score += 15; else suggestions.push('Add numbers');
  if (/[^a-zA-Z0-9]/.test(password)) score += 20; else suggestions.push('Add special characters (!@#$...)');

  if (score <= 30)  return { level: 'weak',   score, label: 'Weak',   color: '#ef4444', suggestions };
  if (score <= 55)  return { level: 'fair',   score, label: 'Fair',   color: '#f59e0b', suggestions };
  if (score <= 75)  return { level: 'good',   score, label: 'Good',   color: '#3b82f6', suggestions };
  return                    { level: 'strong', score, label: 'Strong', color: '#10b981', suggestions };
}

// ─── Password Generator ───────────────────────────────────────────────────────

export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

const CHARS = {
  lower:   'abcdefghijklmnopqrstuvwxyz',
  upper:   'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

export function generatePassword(opts: GeneratorOptions): string {
  let pool = '';
  const required: string[] = [];

  if (opts.lowercase) { pool += CHARS.lower;   required.push(CHARS.lower[Math.floor(Math.random() * CHARS.lower.length)]); }
  if (opts.uppercase) { pool += CHARS.upper;   required.push(CHARS.upper[Math.floor(Math.random() * CHARS.upper.length)]); }
  if (opts.numbers)   { pool += CHARS.numbers; required.push(CHARS.numbers[Math.floor(Math.random() * CHARS.numbers.length)]); }
  if (opts.symbols)   { pool += CHARS.symbols; required.push(CHARS.symbols[Math.floor(Math.random() * CHARS.symbols.length)]); }

  if (!pool) return '';

  const rest = Array.from(
    { length: opts.length - required.length },
    () => pool[Math.floor(Math.random() * pool.length)],
  );

  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join('');
}

// ─── Categories ───────────────────────────────────────────────────────────────

export type Category = 'all' | 'social' | 'work' | 'banking' | 'shopping' | 'other';

export const CATEGORIES: { id: Category; label: string; emoji: string; color: string }[] = [
  { id: 'all',      label: 'All',      emoji: '🔐', color: 'violet' },
  { id: 'social',   label: 'Social',   emoji: '💬', color: 'blue'   },
  { id: 'work',     label: 'Work',     emoji: '💼', color: 'amber'  },
  { id: 'banking',  label: 'Banking',  emoji: '🏦', color: 'emerald'},
  { id: 'shopping', label: 'Shopping', emoji: '🛍️', color: 'pink'   },
  { id: 'other',    label: 'Other',    emoji: '📁', color: 'gray'   },
];

export const SITE_ICONS: Record<string, string> = {
  facebook: '🔵', instagram: '🟣', twitter: '🐦', tiktok: '⚫',
  youtube: '🔴',  discord: '🟣',   reddit: '🟠',  linkedin: '🔵',
  gmail: '🔴',    google: '🔴',    outlook: '🔵',  yahoo: '🟣',
  github: '⚫',   gitlab: '🟠',    figma: '🟣',    notion: '⚫',
  netflix: '🔴',  spotify: '🟢',   apple: '⚫',    amazon: '🟠',
};

export function getSiteEmoji(siteName: string): string {
  if (!siteName) return '🌐';
  const key = siteName.toLowerCase();
  for (const [k, v] of Object.entries(SITE_ICONS)) {
    if (key.includes(k)) return v;
  }
  return '🌐';
}
