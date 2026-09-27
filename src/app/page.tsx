"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Reminder = {
  id: number;
  title: string;
  datetime: string;
  notes: string | null;
  createdAt: string;
};

type Memory = {
  id: number;
  key: string | null;
  content: string;
  createdAt: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionEvent = {
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: {
      transcript: string;
    };
  }>;
};

const EXAMPLE_PROMPTS = [
  "What's the weather in Austin?",
  "Remind me to call mom tomorrow at 5pm",
  "Remember that I'm allergic to peanuts",
];

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = window.localStorage.getItem("theme");
    const darkPreferred = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return saved ? saved === "dark" : darkPreferred;
  });

  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDatetime, setReminderDatetime] = useState("");
  const [reminderNotes, setReminderNotes] = useState("");

  const [memoryKey, setMemoryKey] = useState("");
  const [memoryContent, setMemoryContent] = useState("");

  const endRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const assistantContentRef = useRef("");

  const statusText = useMemo(() => {
    if (thinking) return "Thinking...";
    if (speaking) return "Speaking...";
    if (listening) return "Listening...";
    return "Ready";
  }, [thinking, speaking, listening]);

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", isDark);
    document.documentElement.classList.toggle("theme-light", !isDark);
    window.localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    void Promise.all([loadReminders(), loadMemories()]);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  async function loadReminders() {
    const response = await fetch("/api/reminders");
    const data = (await response.json()) as { reminders: Reminder[] };
    setReminders(data.reminders ?? []);
  }

  async function loadMemories() {
    const response = await fetch("/api/memories");
    const data = (await response.json()) as { memories: Memory[] };
    setMemories(data.memories ?? []);
  }

  const startListening = () => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };

    const SpeechRecognitionCtor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    setError(null);

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      setInput((current) => `${current} ${transcript}`.trim());
    };

    recognition.onerror = () => {
      setListening(false);
      setError("Unable to capture voice input. Please try again.");
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const speak = (text: string) => {
    if (!voiceEnabled || !text.trim()) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async (prompt?: string) => {
    const content = (prompt ?? input).trim();
    if (!content || thinking) {
      return;
    }

    setError(null);
    setThinking(true);
    setInput("");

    const userMessage: ChatMessage = { id: createId(), role: "user", content };
    const assistantMessageId = createId();

    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantMessageId, role: "assistant", content: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((message) => ({
            role: message.role,
            content: message.content,
          })),
        }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Chat request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      assistantContentRef.current = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { type: "delta"; content: string }
            | { type: "error"; error: string }
            | { type: "done" };

          if (event.type === "delta") {
            assistantContentRef.current = `${assistantContentRef.current}${event.content}`;
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: assistantContentRef.current }
                  : message
              )
            );
          }

          if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }

      speak(assistantContentRef.current.trim());
      await Promise.all([loadReminders(), loadMemories()]);
    } catch (chatError) {
      setMessages((current) =>
        current.filter((message) => message.id !== assistantMessageId)
      );
      setError(chatError instanceof Error ? chatError.message : "Something went wrong.");
    } finally {
      setThinking(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  const addReminder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: reminderTitle,
        datetime: new Date(reminderDatetime).toISOString(),
        notes: reminderNotes,
      }),
    });

    setReminderTitle("");
    setReminderDatetime("");
    setReminderNotes("");
    await loadReminders();
  };

  const addMemory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: memoryKey, content: memoryContent }),
    });

    setMemoryKey("");
    setMemoryContent("");
    await loadMemories();
  };

  const deleteReminder = async (id: number) => {
    await fetch(`/api/reminders?id=${id}`, { method: "DELETE" });
    await loadReminders();
  };

  const deleteMemory = async (id: number) => {
    await fetch(`/api/memories?id=${id}`, { method: "DELETE" });
    await loadMemories();
  };

  const editReminder = async (reminder: Reminder) => {
    const title = window.prompt("Reminder title", reminder.title);
    if (!title) return;

    const datetime = window.prompt(
      "Reminder datetime (ISO)",
      new Date(reminder.datetime).toISOString()
    );
    if (!datetime) return;

    const notes = window.prompt("Reminder notes", reminder.notes ?? "") ?? "";

    await fetch("/api/reminders", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: reminder.id, title, datetime, notes }),
    });

    await loadReminders();
  };

  const editMemory = async (memory: Memory) => {
    const key = window.prompt("Memory key", memory.key ?? "") ?? "";
    const content = window.prompt("Memory content", memory.content);
    if (!content) return;

    await fetch("/api/memories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: memory.id, key, content }),
    });

    await loadMemories();
  };

  return (
    <div className="mx-auto flex h-screen w-full max-w-7xl flex-col gap-4 p-4 md:flex-row">
      <aside className="w-full space-y-4 rounded-xl border border-black/10 bg-white/70 p-4 shadow-sm backdrop-blur md:w-80 dark:border-white/15 dark:bg-zinc-900/70">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">AI Assistant</h1>
          <button
            type="button"
            onClick={() => setIsDark((value) => !value)}
            className="rounded-lg border border-black/10 px-2 py-1 text-xs dark:border-white/20"
          >
            {isDark ? "Light" : "Dark"}
          </button>
        </div>

        <div className="rounded-lg bg-emerald-50 p-2 text-sm dark:bg-emerald-900/30">
          Status: <span className="font-medium">{statusText}</span>
        </div>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Upcoming reminders</h2>
          <form className="space-y-2" onSubmit={addReminder}>
            <input
              value={reminderTitle}
              onChange={(event) => setReminderTitle(event.target.value)}
              placeholder="Title"
              className="w-full rounded border border-black/10 bg-transparent px-2 py-1 text-sm"
              required
            />
            <input
              type="datetime-local"
              value={reminderDatetime}
              onChange={(event) => setReminderDatetime(event.target.value)}
              className="w-full rounded border border-black/10 bg-transparent px-2 py-1 text-sm"
              required
            />
            <input
              value={reminderNotes}
              onChange={(event) => setReminderNotes(event.target.value)}
              placeholder="Notes (optional)"
              className="w-full rounded border border-black/10 bg-transparent px-2 py-1 text-sm"
            />
            <button className="w-full rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black" type="submit">
              Add reminder
            </button>
          </form>
          <ul className="max-h-48 space-y-2 overflow-auto">
            {reminders.map((reminder) => (
              <li key={reminder.id} className="rounded border border-black/10 p-2 text-sm">
                <p className="font-medium">{reminder.title}</p>
                <p className="text-xs text-zinc-500">{new Date(reminder.datetime).toLocaleString()}</p>
                {reminder.notes && <p className="text-xs">{reminder.notes}</p>}
                <div className="mt-2 flex gap-2 text-xs">
                  <button type="button" className="underline" onClick={() => editReminder(reminder)}>
                    Edit
                  </button>
                  <button type="button" className="underline" onClick={() => deleteReminder(reminder.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Saved memories</h2>
          <form className="space-y-2" onSubmit={addMemory}>
            <input
              value={memoryKey}
              onChange={(event) => setMemoryKey(event.target.value)}
              placeholder="Key (optional)"
              className="w-full rounded border border-black/10 bg-transparent px-2 py-1 text-sm"
            />
            <textarea
              value={memoryContent}
              onChange={(event) => setMemoryContent(event.target.value)}
              placeholder="What should I remember?"
              className="w-full rounded border border-black/10 bg-transparent px-2 py-1 text-sm"
              rows={2}
              required
            />
            <button className="w-full rounded bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black" type="submit">
              Save memory
            </button>
          </form>
          <ul className="max-h-48 space-y-2 overflow-auto">
            {memories.map((memory) => (
              <li key={memory.id} className="rounded border border-black/10 p-2 text-sm">
                {memory.key && <p className="text-xs font-semibold text-zinc-500">{memory.key}</p>}
                <p>{memory.content}</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <button type="button" className="underline" onClick={() => editMemory(memory)}>
                    Edit
                  </button>
                  <button type="button" className="underline" onClick={() => deleteMemory(memory.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-white/70 shadow-sm backdrop-blur dark:border-white/15 dark:bg-zinc-900/70">
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-black/20 p-4 text-sm text-zinc-600 dark:border-white/20 dark:text-zinc-300">
              <p className="mb-3 text-base font-medium text-zinc-800 dark:text-zinc-100">
                Welcome! Try one of these prompts:
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                message.role === "user"
                  ? "ml-auto bg-black text-white dark:bg-white dark:text-black"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
              }`}
            >
              {message.content || <span className="opacity-50">...</span>}
            </div>
          ))}

          {thinking && (
            <p className="text-sm text-zinc-500">Assistant is thinking...</p>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={onSubmit} className="border-t border-black/10 p-4 dark:border-white/15">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask anything..."
              rows={2}
              className="flex-1 resize-none rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm focus:outline-none"
            />
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              className={`rounded-xl border px-3 py-2 text-xs ${
                listening
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-700"
                  : "border-black/15"
              }`}
            >
              {listening ? "Stop Mic" : "Mic"}
            </button>
            <button
              type="button"
              onClick={() => setVoiceEnabled((value) => !value)}
              className="rounded-xl border border-black/15 px-3 py-2 text-xs"
            >
              {voiceEnabled ? "Mute" : "Unmute"}
            </button>
            <button
              type="submit"
              disabled={thinking}
              className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              Send
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </form>
      </main>
    </div>
  );
}
