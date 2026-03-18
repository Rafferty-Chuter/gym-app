"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { getTrainingSummary } from "@/utils/trainingSummary";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function AssistantPage() {
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
          className="text-zinc-400 hover:text-white transition text-sm mb-4 inline-block"
        >
          ← Home
        </Link>
        <h1 className="text-3xl font-bold mb-4">Assistant</h1>
        <p className="text-zinc-400 text-sm mb-4">
          Ask about your training. I’ll use your workout history to help.
        </p>

        <div className="flex-1 overflow-y-auto rounded-xl bg-zinc-900 border border-zinc-800 p-4 mb-4 min-h-[200px]">
          {messages.length === 0 ? (
            <p className="text-zinc-500 text-sm">Send a message to start.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m, i) => (
                <li
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <span
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-zinc-700 text-white"
                        : "bg-zinc-800 text-zinc-200 border border-zinc-700"
                    }`}
                  >
                    {m.content}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isLoading && (
            <p className="text-zinc-500 text-sm mt-2">Thinking…</p>
          )}
          <div ref={listEndRef} />
        </div>

        {messages.length === 0 && !isLoading && (
          <div className="mb-3">
            <p className="text-xs text-zinc-500 mb-2">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSend(p)}
                  className="text-left text-sm px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:bg-zinc-800/60 transition"
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
            className="flex-1 min-w-0 p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus-accent disabled:opacity-50"
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
