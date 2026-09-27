import { prisma } from "@/lib/prisma";
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
  };

  const title = body.title?.trim();
  const datetime = body.datetime ? new Date(body.datetime) : null;

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
    const parsed = new Date(body.datetime);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "Invalid datetime." }, { status: 400 });
    }
    data.datetime = parsed;
  }

  if (typeof body.notes === "string") {
    data.notes = body.notes.trim() || null;
  }

  const reminder = await prisma.reminder.update({
    where: { id: Number(body.id) },
    data,
  });

  return NextResponse.json({ reminder });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "A numeric id is required." }, { status: 400 });
  }

  await prisma.reminder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
