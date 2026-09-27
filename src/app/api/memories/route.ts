import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const memories = await prisma.memory.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ memories });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    key?: string;
    content?: string;
  };

  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content is required." }, { status: 400 });
  }

  const memory = await prisma.memory.create({
    data: {
      key: body.key?.trim() || null,
      content,
    },
  });

  return NextResponse.json({ memory }, { status: 201 });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    id?: number;
    key?: string;
    content?: string;
  };

  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const data: { key?: string | null; content?: string } = {};

  if (typeof body.key === "string") {
    data.key = body.key.trim() || null;
  }

  if (typeof body.content === "string") {
    const content = body.content.trim();
    if (!content) {
      return NextResponse.json({ error: "content cannot be empty." }, { status: 400 });
    }
    data.content = content;
  }

  try {
    const memory = await prisma.memory.update({
      where: { id },
      data,
    });

    return NextResponse.json({ memory });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
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
    await prisma.memory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Memory not found." }, { status: 404 });
    }
    throw error;
  }
}
