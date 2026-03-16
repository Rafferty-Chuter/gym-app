import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="bg-zinc-950 border-b border-zinc-800 px-6 py-4">
      <div className="max-w-4xl mx-auto flex items-center gap-6">
        <Link
          href="/"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          Home
        </Link>
        <Link
          href="/workout"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          Start Workout
        </Link>
        <Link
          href="/templates"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          Templates
        </Link>
        <Link
          href="/history"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          History
        </Link>
        <Link
          href="/progress"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          Progress
        </Link>
        <Link
          href="/volume"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          Volume
        </Link>
        <Link
          href="/coach"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          Coach
        </Link>
        <Link
          href="/assistant"
          className="text-white font-medium hover:text-zinc-300 transition"
        >
          Assistant
        </Link>
      </div>
    </nav>
  );
}
