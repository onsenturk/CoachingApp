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
  const updated = await prisma.program.updateMany({
    where: { id, userId, status: "draft" },
    data: { status: "discarded" },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Draft plan not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ discarded: true });
}
