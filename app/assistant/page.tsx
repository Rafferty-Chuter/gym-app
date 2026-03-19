"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { getTrainingSummary } from "@/utils/trainingSummary";
import { getWorkoutHistory, getExerciseTrends } from "@/lib/trainingAnalysis";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function AssistantPage() {
  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const starterPrompts = [
    "How is my training looking this week?",
    "Am I doing enough chest volume?",
    "What should I improve next session?",
    "Am I neglecting any muscle groups?",
  ] as const;

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    try {
      const summary = getTrainingSummary();
      const recentExercises = new Set<string>();
      for (const w of summary.recentWorkouts) {
        for (const ex of w.exercises ?? []) {
          if (ex.name?.trim()) recentExercises.add(ex.name.trim());
        }
      }
      const allWorkouts = getWorkoutHistory();
      const exerciseTrends = getExerciseTrends(allWorkouts, { maxSessions: 5 });

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          trainingSummary: {
            totalWorkouts: summary.totalWorkouts,
            totalExercises: summary.totalExercises,
            totalSets: summary.totalSets,
            weeklyVolume: summary.weeklyVolume,
            recentExercises: Array.from(recentExercises),
          },
          trainingFocus: focus,
          experienceLevel,
          unit,
          exerciseTrends,
        }),
      });

      const data = await res.json();
if (res.ok && typeof data.reply === "string") {
  setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
} else {
  setMessages((prev) => [
    ...prev,
    {
      role: "assistant",
      content: `Error: ${data.error ?? "Sorry, I couldn’t get a response. Please try again."}`,
    },
  ]);
}
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 flex flex-col">
      <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0">
        <Link
          href="/"
          className="text-app-secondary hover:text-white transition-colors text-sm mb-4 inline-block font-medium"
        >
          ← Home
        </Link>
        <h1 className="text-3xl font-bold text-white mb-2">Assistant</h1>
        <p className="text-app-secondary text-sm mb-4">
          Ask about your training. I’ll use your workout history to help.
        </p>

        <div className="flex-1 overflow-y-auto rounded-2xl border border-teal-950/40 bg-gradient-to-b from-zinc-900/95 to-teal-950/25 p-4 mb-4 min-h-[200px]">
          {messages.length === 0 ? (
            <p className="text-app-meta text-sm">Send a message to start.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m, i) => (
                <li
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <span
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-teal-500/25 text-teal-50 border border-teal-500/30"
                        : "border border-teal-900/40 bg-zinc-900/80 text-app-secondary"
                    }`}
                  >
                    {m.content}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isLoading && (
            <p className="text-app-meta text-sm mt-2">Thinking…</p>
          )}
          <div ref={listEndRef} />
        </div>

        {messages.length === 0 && !isLoading && (
          <div className="mb-3">
            <p className="label-section mb-2">Try one of these</p>
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSend(p)}
                  className="text-left text-sm px-3 py-2 rounded-xl border border-teal-950/40 bg-zinc-900/80 text-app-secondary hover:border-teal-500/25 hover:text-white transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about your training..."
            disabled={isLoading}
            className="input-app flex-1 min-w-0 p-3 disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="px-4 py-3 rounded-xl btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
