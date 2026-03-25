export type AssistantThreadMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO
};

export type AssistantThread = {
  thread_id: string;
  created_at: string; // ISO
  updated_at: string; // ISO
  title?: string;
  summary?: string;
  messages: AssistantThreadMessage[];
};

const THREADS_STORAGE_KEY = "assistantThreadsV1";
const ACTIVE_THREAD_ID_KEY = "assistantActiveThreadIdV1";
const USER_ID_KEY = "assistantUserId";
const MEMORY_VERSION = 1;

function safeNowIso(): string {
  return new Date().toISOString();
}

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const raw = window.localStorage.getItem(USER_ID_KEY);
    if (raw && raw.trim()) return raw.trim();
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `u_${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

function makeThreadId(): string {
  const userId = getOrCreateUserId();
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `t_${userId}_${Date.now()}_${rand}_v${MEMORY_VERSION}`;
}

type StoredThreadMap = Record<string, AssistantThread>;

function readThreads(): StoredThreadMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredThreadMap;
  } catch {
    return {};
  }
}

function writeThreads(map: StoredThreadMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function readActiveThreadId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_THREAD_ID_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function writeActiveThreadId(threadId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_THREAD_ID_KEY, threadId);
  } catch {
    // ignore
  }
}

function safeTrimContent(s: string): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normalizeThreadMessage(m: unknown): AssistantThreadMessage | null {
  if (!m || typeof m !== "object") return null;
  const r = m as Partial<AssistantThreadMessage>;
  if (r.role !== "user" && r.role !== "assistant") return null;
  if (typeof r.content !== "string") return null;
  const id = typeof r.id === "string" && r.id.trim() ? r.id : `m_${Math.random().toString(16).slice(2)}`;
  return {
    id,
    role: r.role,
    content: safeTrimContent(r.content),
    createdAt: typeof r.createdAt === "string" && r.createdAt ? r.createdAt : safeNowIso(),
  };
}

function normalizeThread(t: unknown): AssistantThread | null {
  if (!t || typeof t !== "object") return null;
  const r = t as Partial<AssistantThread>;
  if (typeof r.thread_id !== "string" || !r.thread_id.trim()) return null;
  const created_at = typeof r.created_at === "string" && r.created_at ? r.created_at : safeNowIso();
  const updated_at = typeof r.updated_at === "string" && r.updated_at ? r.updated_at : created_at;
  const messagesRaw = Array.isArray(r.messages) ? r.messages : [];
  const messages = messagesRaw.map(normalizeThreadMessage).filter(Boolean) as AssistantThreadMessage[];
  return {
    thread_id: r.thread_id,
    created_at,
    updated_at,
    title: typeof r.title === "string" ? r.title : undefined,
    summary: typeof r.summary === "string" ? r.summary : undefined,
    messages,
  };
}

export function loadActiveThread(): {
  threadId: string;
  thread: AssistantThread;
  exactThreadLoaded: boolean;
  createdNewThread: boolean;
} {
  // Server-safe fallback: no threads available.
  if (typeof window === "undefined") {
    const now = safeNowIso();
    return {
      threadId: "server",
      thread: {
        thread_id: "server",
        created_at: now,
        updated_at: now,
        messages: [],
      },
      exactThreadLoaded: false,
      createdNewThread: false,
    };
  }

  const map = readThreads();
  const activeId = readActiveThreadId();
  if (activeId && map[activeId]) {
    const normalized = normalizeThread(map[activeId]);
    if (normalized) {
      return {
        threadId: activeId,
        thread: normalized,
        exactThreadLoaded: true,
        createdNewThread: false,
      };
    }
  }

  // Create new thread if none exists. We do NOT claim exact prior memory.
  const now = safeNowIso();
  const newId = makeThreadId();
  const newThread: AssistantThread = {
    thread_id: newId,
    created_at: now,
    updated_at: now,
    messages: [],
  };
  const nextMap: StoredThreadMap = { ...map, [newId]: newThread };
  writeThreads(nextMap);
  writeActiveThreadId(newId);
  return {
    threadId: newId,
    thread: newThread,
    exactThreadLoaded: false,
    createdNewThread: true,
  };
}

export function getThreadById(threadId: string): AssistantThread | null {
  if (typeof window === "undefined") return null;
  const map = readThreads();
  if (!map[threadId]) return null;
  return normalizeThread(map[threadId]);
}

export function appendToThread(params: {
  threadId: string;
  role: "user" | "assistant";
  content: string;
}): AssistantThread {
  if (typeof window === "undefined") {
    const now = safeNowIso();
    return {
      thread_id: params.threadId,
      created_at: now,
      updated_at: now,
      messages: [
        {
          id: `m_${Math.random().toString(16).slice(2)}`,
          role: params.role,
          content: safeTrimContent(params.content),
          createdAt: now,
        },
      ],
    };
  }

  const map = readThreads();
  const existing = map[params.threadId];
  const normalizedExisting = existing ? normalizeThread(existing) : null;
  const thread: AssistantThread =
    normalizedExisting ??
    ({
      thread_id: params.threadId,
      created_at: safeNowIso(),
      updated_at: safeNowIso(),
      messages: [],
    } as AssistantThread);

  const now = safeNowIso();
  const nextMsg: AssistantThreadMessage = {
    id: `m_${Math.random().toString(16).slice(2)}`,
    role: params.role,
    content: safeTrimContent(params.content),
    createdAt: now,
  };
  const nextThread: AssistantThread = {
    ...thread,
    updated_at: now,
    messages: [...thread.messages, nextMsg],
  };

  const nextMap: StoredThreadMap = { ...map, [params.threadId]: nextThread };
  writeThreads(nextMap);
  // Keep this thread as active for continuity.
  writeActiveThreadId(params.threadId);

  return nextThread;
}

export function getActiveThreadId(): string | null {
  return readActiveThreadId();
}

