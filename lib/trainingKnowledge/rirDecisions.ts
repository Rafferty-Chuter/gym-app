export function interpretSessionEffort(rirs: number[]): "too_easy" | "on_target" | "too_hard" {
  if (!rirs.length) return "on_target";
  const avg = rirs.reduce((a, b) => a + b, 0) / rirs.length;
  if (avg > 3) return "too_easy";
  if (avg < 1) return "too_hard";
  return "on_target";
}

export function detectTooEasyToStaySame(rirs: number[]): boolean {
  return rirs.length >= 2 && rirs.every((r) => r > 3);
}

export function detectTooHardToProgress(rirs: number[], repsTrendFlat: boolean): boolean {
  return rirs.length >= 2 && rirs.every((r) => r <= 1) && repsTrendFlat;
}

export function progressionDecisionFromRIR(params: {
  rirs: number[];
  repsTrendFlat: boolean;
}): "increase_load" | "increase_reps" | "hold" | "reduce" {
  if (detectTooEasyToStaySame(params.rirs)) return "increase_load";
  if (detectTooHardToProgress(params.rirs, params.repsTrendFlat)) return "reduce";
  const state = interpretSessionEffort(params.rirs);
  if (state === "on_target") return params.repsTrendFlat ? "hold" : "increase_reps";
  if (state === "too_hard") return "hold";
  return "increase_reps";
}

