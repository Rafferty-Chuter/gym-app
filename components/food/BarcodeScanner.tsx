"use client";

import { useEffect, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { PrimaryButton } from "@/components/physique/ui";

type Props = { open: boolean; onClose: () => void; onCode: (code: string) => void };

/** Poll the native detector this often. OURS. */
const DETECT_MS = 150;

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

/**
 * Barcode scanner (M4): the rear camera into a video element, the
 * browser's BarcodeDetector where it exists, otherwise ZXing loaded on
 * demand. A typed code works everywhere, camera or not.
 */
export default function BarcodeScanner({ open, onClose, onCode }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Scan a barcode">
      {open && <Inner onCode={onCode} />}
    </Sheet>
  );
}

function Inner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "unsupported">("starting");
  const [typed, setTyped] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let zxingStop: (() => void) | null = null;
    let cancelled = false;
    const video = videoRef.current;
    const finish = (code: string) => {
      if (doneRef.current || !/^\d{8,14}$/.test(code)) return;
      doneRef.current = true;
      onCode(code);
    };
    async function start() {
      if (!video || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setState("denied");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play().catch(() => undefined);
      setState("scanning");
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (Ctor) {
        const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        const tick = async () => {
          if (cancelled || doneRef.current) return;
          try {
            const found = await detector.detect(video);
            if (found[0]?.rawValue) {
              finish(found[0].rawValue);
              return;
            }
          } catch {
            // A frame can fail to decode; keep going.
          }
          timer = window.setTimeout(() => void tick(), DETECT_MS);
        };
        void tick();
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) finish(result.getText());
        });
        zxingStop = () => controls.stop();
      } catch {
        if (!cancelled) setState("unsupported");
      }
    }
    void start();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      zxingStop?.();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[12px]" style={{ background: "#141416", aspectRatio: "4 / 3" }}>
        <video ref={videoRef} muted autoPlay playsInline className="h-full w-full object-cover" aria-label="Camera" />
        {state === "scanning" && <div className="pointer-events-none absolute inset-x-6 top-1/2 h-[2px] -translate-y-1/2 rounded" style={{ background: "#f2f2f0", opacity: 0.6 }} aria-hidden />}
        {state !== "scanning" && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px]" style={{ color: "#a3a3a8" }}>
            {state === "starting" ? "Starting the camera" : state === "denied" ? "Camera access was refused. Type the number under the barcode instead." : "This browser cannot use the camera here. Type the number under the barcode instead."}
          </p>
        )}
      </div>
      <p className="text-[12px]" style={{ color: "#6f6f76" }}>
        Hold the barcode flat and fill the frame. Packaged foods only; loose foods are in search.
      </p>
      <div className="flex gap-2">
        <input type="text" inputMode="numeric" pattern="[0-9]*" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} placeholder="Or type the number" className="h-11 min-w-0 flex-1 rounded-[12px] px-3 text-[15px] outline-none focus:ring-1" style={{ background: "#1d1d20", color: "#f2f2f0", border: "1px solid #2a2a2e" }} aria-label="Barcode number" autoComplete="off" />
        <div className="w-[110px] shrink-0">
          <PrimaryButton onClick={() => onCode(typed)} disabled={!/^\d{8,14}$/.test(typed)}>
            Look up
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
