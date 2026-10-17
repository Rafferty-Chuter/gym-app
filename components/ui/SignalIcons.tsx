import type { ComponentType } from "react";
import type { SignalKey } from "@/lib/ui/status";

/** 22px line icons for the three training signals. Colour comes from `STATE_COLOR[state].stroke`. */

export function PlateauIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      <path d="M3 18 L8 11 L16 11 L21 18" />
    </svg>
  );
}

export function VolumeIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      <line x1="6" y1="19" x2="6" y2="14" />
      <line x1="12" y1="19" x2="12" y2="9" />
      <line x1="18" y1="19" x2="18" y2="11" />
    </svg>
  );
}

export function ProgressIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      <path d="M3 17 L9 11 L13 14 L21 6" />
      <polyline points="15 6 21 6 21 12" />
    </svg>
  );
}

export const SIGNAL_ICON: Record<SignalKey, ComponentType<{ color: string }>> = {
  plateau: PlateauIcon,
  volume: VolumeIcon,
  progress: ProgressIcon,
};
