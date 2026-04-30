import type { ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";

export function scoreDayForExercise(
  targetMuscles: string[] | undefined,
  ex: ExerciseMetadata
): number {
  if (!targetMuscles?.length) return 0;
  let score = 0;
  const targets = new Set(targetMuscles.map((m) => m.toLowerCase()));

  const matchesLeg = () =>
    targets.has("legs") &&
    ex.tags.some((t) => ["legs", "lower", "quad_dominant", "hip_hinge"].includes(t) || t.includes("leg"));
  const matchesBack = () =>
    targets.has("back") &&
    (ex.tags.includes("back") ||
      ex.tags.includes("pull") ||
      ex.primaryMuscles.some((p) => /lat|back|trap|rhom/i.test(p)));
  const matchesChest = () =>
    targets.has("chest") && (ex.tags.includes("chest") || ex.primaryMuscles.some((p) => p.includes("chest")));
  const matchesShoulders = () =>
    targets.has("shoulders") &&
    (ex.tags.includes("shoulders") || ex.primaryMuscles.some((p) => /delt|shoulder/i.test(p)));
  const matchesArms = () =>
    targets.has("arms") &&
    (ex.tags.includes("arms") || ex.primaryMuscles.some((p) => /biceps|triceps/i.test(p)));

  for (const p of ex.primaryMuscles) {
    const pl = p.toLowerCase();
    if (targets.has("chest") && pl.includes("chest")) score += 3;
    if (targets.has("back") && (pl.includes("lat") || pl.includes("back") || pl.includes("trap"))) score += 3;
    if (targets.has("shoulders") && (pl.includes("delt") || pl.includes("shoulder"))) score += 3;
    if (targets.has("biceps") && pl.includes("biceps")) score += 3;
    if (targets.has("triceps") && pl.includes("triceps")) score += 3;
    if (targets.has("legs") && (pl.includes("quad") || pl.includes("ham") || pl.includes("glute") || pl.includes("calf")))
      score += 3;
  }

  if (matchesLeg()) score += 2;
  if (matchesBack()) score += 2;
  if (matchesChest()) score += 2;
  if (matchesShoulders()) score += 2;
  if (matchesArms()) score += 2;

  for (const tag of ex.tags) {
    if (targets.has(tag)) score += 1;
  }

  return score;
}
