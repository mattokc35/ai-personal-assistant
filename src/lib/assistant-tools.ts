import { prisma } from "@/lib/prisma";
import { parseClientDatetime } from "@/lib/datetime";
import OpenAI from "openai";

type Json = Record<string, unknown>;

export const toolDefinitions = [
  {
    type: "function",
    name: "web_search",
    description: "Search the web for up-to-date information.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "get_weather",
    description: "Get current weather and short forecast for a city or location.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City or place name, e.g. Austin, TX.",
        },
      },
      required: ["location"],
    },
  },
  {
    type: "function",
    name: "create_reminder",
    description: "Create a reminder with title, date/time, and optional notes.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        datetime: {
          type: "string",
          description: "ISO-8601 date/time string",
        },
        timezoneOffsetMinutes: {
          type: "number",
          description:
            "Optional timezone offset in minutes (UTC - local), used for local datetime strings.",
        },
        notes: { type: "string" },
      },
      required: ["title", "datetime"],
    },
  },
  {
    type: "function",
    name: "list_reminders",
    description: "List reminders sorted by date/time.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "delete_reminder",
    description: "Delete a reminder by id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
    },
  },
  {
    type: "function",
    name: "save_memory",
    description: "Save a user fact/memory for future chats.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Optional label for the memory" },
        content: { type: "string", description: "Fact to remember" },
      },
      required: ["content"],
    },
  },
  {
    type: "function",
    name: "list_memories",
    description: "List saved user memories.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "delete_memory",
    description: "Delete a saved memory by id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number" },
      },
      required: ["id"],
    },
  },
] as const;

export const chatToolDefinitions: OpenAI.Chat.Completions.ChatCompletionTool[] =
  toolDefinitions.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

async function webSearch(query: string): Promise<Json> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      error:
        "Web search is not configured. Set TAVILY_API_KEY in your environment to enable this tool.",
    };
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    }),
  });

  if (!response.ok) {
    return {
      error: `Web search failed with status ${response.status}.`,
    };
  }

  const data = (await response.json()) as {
    answer?: string;
    results?: Array<{ title: string; url: string; content?: string }>;
  };

  return {
    answer: data.answer,
    results: (data.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
    })),
  };
}

async function getWeather(location: string): Promise<Json> {
  const geoResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
  );

  if (!geoResponse.ok) {
    return { error: `Unable to geocode location (${geoResponse.status}).` };
  }

  const geoData = (await geoResponse.json()) as {
    results?: Array<{ name: string; latitude: number; longitude: number; country?: string }>;
  };

  const best = geoData.results?.[0];
  if (!best) {
    return { error: `Could not find location: ${location}` };
  }

  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${best.latitude}&longitude=${best.longitude}&current=temperature_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`
  );

  if (!weatherResponse.ok) {
    return { error: `Unable to fetch weather (${weatherResponse.status}).` };
  }

  const weatherData = (await weatherResponse.json()) as {
    current?: {
      temperature_2m: number;
      wind_speed_10m: number;
      weather_code: number;
      time: string;
    };
    daily?: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
    };
  };

  return {
    location: `${best.name}${best.country ? `, ${best.country}` : ""}`,
    current: weatherData.current,
    forecast:
      weatherData.daily?.time.map((day, index) => ({
        day,
        maxC: weatherData.daily?.temperature_2m_max[index],
        minC: weatherData.daily?.temperature_2m_min[index],
      })) ?? [],
  };
}

export async function executeTool(name: string, args: Json): Promise<Json> {
  switch (name) {
    case "web_search":
      return webSearch(String(args.query ?? ""));
    case "get_weather":
      return getWeather(String(args.location ?? ""));
    case "create_reminder": {
      const datetime = parseClientDatetime(
        String(args.datetime ?? ""),
        Number(args.timezoneOffsetMinutes)
      );
      if (!datetime || Number.isNaN(datetime.getTime())) {
        return { error: "Invalid datetime. Please provide an ISO-8601 date/time." };
      }

      const reminder = await prisma.reminder.create({
        data: {
          title: String(args.title ?? ""),
          datetime,
          notes: typeof args.notes === "string" ? args.notes : null,
        },
      });
      return reminder;
    }
    case "list_reminders": {
      const reminders = await prisma.reminder.findMany({
        orderBy: { datetime: "asc" },
        take: 20,
      });
      return { reminders };
    }
    case "delete_reminder": {
      const id = Number(args.id);
      if (!Number.isFinite(id)) {
        return { error: "id must be a number" };
      }

      try {
        await prisma.reminder.delete({ where: { id } });
        return { success: true };
      } catch {
        return { error: `Reminder ${id} not found.` };
      }
    }
    case "save_memory": {
      const content = String(args.content ?? "").trim();
      if (!content) {
        return { error: "content is required" };
      }

      const memory = await prisma.memory.create({
        data: {
          key: typeof args.key === "string" ? args.key : null,
          content,
        },
      });
      return memory;
    }
    case "list_memories": {
      const memories = await prisma.memory.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      return { memories };
    }
    case "delete_memory": {
      const id = Number(args.id);
      if (!Number.isFinite(id)) {
        return { error: "id must be a number" };
      }

      try {
        await prisma.memory.delete({ where: { id } });
        return { success: true };
      } catch {
        return { error: `Memory ${id} not found.` };
      }
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
