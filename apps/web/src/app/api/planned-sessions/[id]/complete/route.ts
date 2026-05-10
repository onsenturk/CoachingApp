import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@coaching/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const plannedSession = await prisma.plannedSession.findFirst({
    where: { id, program: { userId } },
    select: { id: true, status: true },
  });

  if (!plannedSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (plannedSession.status === "done") {
    return NextResponse.json({ completed: true, status: "done" });
  }

  const updated = await prisma.plannedSession.update({
    where: { id: plannedSession.id },
    data: { status: "done" },
    select: { id: true, status: true },
  });

  return NextResponse.json({ completed: true, status: updated.status });
}
