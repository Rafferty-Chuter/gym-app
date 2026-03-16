import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-xl">
        <h1 className="text-3xl font-bold mb-2">Gym AI</h1>
        <p className="text-zinc-400 mb-8">
          Log workouts, manage templates, track progress, and get AI feedback.
        </p>

        <div className="space-y-4">
          <Link
            href="/workout"
            className="block w-full rounded-xl bg-white text-black font-semibold py-4 hover:bg-zinc-200 transition text-center"
          >
            Start Workout
          </Link>

          <Link
            href="/templates"
            className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 py-4 hover:bg-zinc-800 transition text-center"
          >
            Templates
          </Link>

          <Link
            href="/history"
            className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 py-4 hover:bg-zinc-800 transition text-center"
          >
            History
          </Link>

          <Link
            href="/coach"
            className="block w-full rounded-xl border border-zinc-700 bg-zinc-950 py-4 hover:bg-zinc-800 transition text-center"
          >
            AI Coach
          </Link>
        </div>
      </div>
    </main>
  );
}