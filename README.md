# AI Personal Assistant

A polished, demo-ready AI personal assistant built with **Next.js App Router**, **TypeScript**, **Tailwind CSS**, **Prisma + SQLite**, and the **OpenAI API**.

## Features

- **Chat + voice interface**
  - Streaming chat responses
  - Voice input via Web Speech API (`SpeechRecognition`)
  - Voice output via browser speech synthesis (`SpeechSynthesis`) with mute/unmute toggle
  - Thinking / listening / speaking status indicators
- **Assistant tool calling**
  - Web search (Tavily)
  - Weather lookup (Open-Meteo)
  - Reminder CRUD (create/list/delete/edit)
  - Memory CRUD (save/list/delete/edit)
- **Persistence**
  - SQLite database via Prisma
  - `Reminder` and `Memory` Prisma models
- **UI polish**
  - Responsive chat layout
  - Sidebar for reminders and memories
  - Example prompt empty state
  - Dark mode toggle
- **Production-ready setup**
  - App Router API routes
  - Environment variable template
  - Lint and build scripts

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **AI:** OpenAI Chat Completions API + tool calling
- **Database:** Prisma ORM + SQLite

## Environment Variables

Copy and fill:

```bash
cp .env.example .env
```

Required/optional vars:

- `OPENAI_API_KEY` (required) – server-side OpenAI key
- `OPENAI_MODEL` (optional) – defaults to `gpt-4.1-mini`
- `TAVILY_API_KEY` (optional but required for web search tool)
- `DATABASE_URL` (required for Prisma, default `file:./dev.db`)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure env vars:

   ```bash
   cp .env.example .env
   ```

3. Generate Prisma client:

   ```bash
   npm run prisma:generate
   ```

4. Run Prisma migration:

   ```bash
   npx prisma migrate dev
   ```

5. Start dev server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000).

## Architecture Overview

- **Frontend (`src/app/page.tsx`)**
  - Handles chat UI, streaming rendering, voice input/output, and sidebar management.
- **Chat API (`src/app/api/chat/route.ts`)**
  - Receives chat messages
  - Builds system context from saved reminders/memories
  - Calls OpenAI Chat Completions API with tool definitions
  - Executes tool calls server-side and streams final response chunks back to UI
- **Tool executor (`src/lib/assistant-tools.ts`)**
  - Implements: `web_search`, `get_weather`, `create_reminder`, `list_reminders`, `delete_reminder`, `save_memory`, `list_memories`, `delete_memory`
- **Persistence**
  - Prisma schema in `prisma/schema.prisma`
  - SQLite database configured through `DATABASE_URL`
  - APIs:
    - `GET/POST/PUT/DELETE /api/reminders`
    - `GET/POST/PUT/DELETE /api/memories`

## Scripts

- `npm run dev` – run locally
- `npm run build` – production build
- `npm run lint` – ESLint
- `npm run prisma:generate` – generate Prisma client
- `npm run prisma:migrate` – run Prisma migrate dev
- `npm run prisma:studio` – open Prisma Studio

## Screenshots

_Add screenshots/gifs here for portfolio polish:_

- `docs/screenshots/chat.png`
- `docs/screenshots/voice.png`
- `docs/screenshots/sidebar.png`

## Notes

- API keys stay server-side only.
- If `TAVILY_API_KEY` is missing, web search tool returns a clear configuration message instead of crashing.
- `.env` is ignored by git; use `.env.example` for shared setup documentation.
