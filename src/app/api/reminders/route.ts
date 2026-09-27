import { prisma } from "@/lib/prisma";
import { parseClientDatetime } from "@/lib/datetime";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const reminders = await prisma.reminder.findMany({
    orderBy: { datetime: "asc" },
  });
  return NextResponse.json({ reminders });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    title?: string;
    datetime?: string;
    notes?: string;
    timezoneOffsetMinutes?: number;
  };

  const title = body.title?.trim();
  const datetime = parseClientDatetime(body.datetime, body.timezoneOffsetMinutes);

  if (!title || !datetime || Number.isNaN(datetime.getTime())) {
    return NextResponse.json(
      { error: "title and a valid datetime are required." },
      { status: 400 }
    );
  }

  const reminder = await prisma.reminder.create({
    data: {
      title,
      datetime,
      notes: body.notes?.trim() || null,
    },
  });

  return NextResponse.json({ reminder }, { status: 201 });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    id?: number;
    title?: string;
    datetime?: string;
    notes?: string;
    timezoneOffsetMinutes?: number;
  };

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const data: {
    title?: string;
    datetime?: Date;
    notes?: string | null;
  } = {};

  if (typeof body.title === "string") {
    data.title = body.title.trim();
  }

  if (typeof body.datetime === "string") {
    const parsed = parseClientDatetime(body.datetime, body.timezoneOffsetMinutes);
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid datetime." }, { status: 400 });
    }
    data.datetime = parsed;
  }

  if (typeof body.notes === "string") {
    data.notes = body.notes.trim() || null;
  }

  try {
    const reminder = await prisma.reminder.update({
      where: { id: Number(body.id) },
      data,
    });

    return NextResponse.json({ reminder });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "A numeric id is required." }, { status: 400 });
  }

  try {
    await prisma.reminder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Reminder not found." }, { status: 404 });
    }
    throw error;
  }
}
