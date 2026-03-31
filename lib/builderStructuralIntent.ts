/**
 * Structural programme adjustments parsed from natural language.
 * These change slot counts, targets, and scoring — not just copy.
 */
export type BuilderStructuralIntent = {
  moreIsolation?: boolean;
  chestEmphasis?: boolean;
  tricepsEmphasis?: boolean;
  sideDeltEmphasis?: boolean;
  reduceFatigue?: boolean;
};

export function parseBuilderStructuralIntent(message: string): BuilderStructuralIntent {
  const t = message.toLowerCase();
  const out: BuilderStructuralIntent = {};
  if (
    /\bmore\s+isolation\b/.test(t) ||
    /\bextra\s+isolation\b/.test(t) ||
    /\bisolation\s+work\b/.test(t) ||
    /\bisolation\s+movements?\b/.test(t) ||
    /\bincludes?\s+more\s+isolation\b/.test(t) ||
    /\badd\s+isolation\b/.test(t)
  ) {
    out.moreIsolation = true;
  }
  if (/\bmore\s+chest\b/.test(t) || /\bchest\s+emphasis\b/.test(t) || /\bchest\s+priority\b/.test(t)) {
    out.chestEmphasis = true;
  }
  if (/\bmore\s+triceps?\b/.test(t) || /\btriceps?\s+work\b/.test(t) || /\btriceps?\s+emphasis\b/.test(t)) {
    out.tricepsEmphasis = true;
  }
  if (/\b(side\s+delts?|lateral\s+raises?|more\s+side\s+delt)\b/.test(t)) {
    out.sideDeltEmphasis = true;
  }
  if (
    /\breduc(e|ing)\s+fatigue\b/.test(t) ||
    /\bless\s+fatigue\b/.test(t) ||
    /\blower\s+fatigue\b/.test(t) ||
    /\beasier\s+recovery\b/.test(t)
  ) {
    out.reduceFatigue = true;
  }
  return out;
}
