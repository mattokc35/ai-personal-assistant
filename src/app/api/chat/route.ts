import OpenAI from "openai";
import { executeTool, toolDefinitions } from "@/lib/assistant-tools";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "done" }
  | { type: "error"; error: string };

const encoder = new TextEncoder();

function writeEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: StreamEvent
) {
  controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
}

function splitForStreaming(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(
    (message): message is ChatMessage =>
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0
  );
}

async function runAssistant(messages: ChatMessage[]) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const [memories, reminders] = await Promise.all([
    prisma.memory.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.reminder.findMany({ orderBy: { datetime: "asc" }, take: 10 }),
  ]);

  const memoryContext = memories
    .map((memory) => `- ${memory.key ? `[${memory.key}] ` : ""}${memory.content}`)
    .join("\n");
  const reminderContext = reminders
    .map(
      (reminder) =>
        `- #${reminder.id}: ${reminder.title} at ${reminder.datetime.toISOString()}${
          reminder.notes ? ` (${reminder.notes})` : ""
        }`
    )
    .join("\n");

  const systemPrompt = `You are a helpful AI personal assistant in a portfolio app.
Be concise, practical, and friendly.
Use tools whenever the user asks for weather, live/current information, reminders/calendar, or memory operations.
If web search is unavailable, explain how to configure TAVILY_API_KEY.
Current saved memories:\n${memoryContext || "(none)"}
Current reminders:\n${reminderContext || "(none)"}`;

  let input = [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }],
    },
    ...messages.map((message) => ({
      role: message.role,
      content: [{ type: "input_text", text: message.content }],
    })),
  ] as OpenAI.Responses.ResponseInput;

  let finalText = "";
  let iterations = 0;

  while (iterations < 6) {
    iterations += 1;
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input,
      tools: toolDefinitions as unknown as OpenAI.Responses.Tool[],
      tool_choice: "auto",
      temperature: 0.4,
    });

    const functionCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call"
    );

    if (functionCalls.length === 0) {
      finalText = response.output_text || "I could not generate a response.";
      break;
    }

    const toolOutputs = await Promise.all(
      functionCalls.map(async (call) => {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
        } catch {
          parsedArgs = {};
        }

        try {
          const result = await executeTool(call.name, parsedArgs);
          return {
            type: "function_call_output" as const,
            call_id: call.call_id,
            output: JSON.stringify(result),
          };
        } catch (error) {
          return {
            type: "function_call_output" as const,
            call_id: call.call_id,
            output: JSON.stringify({
              error: error instanceof Error ? error.message : "Tool execution failed.",
            }),
          };
        }
      })
    );

    input = toolOutputs;
  }

  if (!finalText) {
    finalText = "I reached my tool-calling limit for this request. Please try again.";
  }

  return finalText;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      {
        error:
          "OPENAI_API_KEY is missing. Add it to your environment variables before using chat.",
      },
      { status: 400 }
    );
  }

  const body = (await request.json()) as { messages?: ChatMessage[] };
  const messages = normalizeMessages(body.messages ?? []);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const responseText = await runAssistant(messages);
        for (const chunk of splitForStreaming(responseText)) {
          writeEvent(controller, { type: "delta", content: chunk });
        }
        writeEvent(controller, { type: "done" });
      } catch (error) {
        writeEvent(controller, {
          type: "error",
          error: error instanceof Error ? error.message : "Something went wrong.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
