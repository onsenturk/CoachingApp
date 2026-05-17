import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma, Prisma } from "@coaching/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await context.params;
  const draft = await prisma.program.findFirst({
    where: { id, userId, status: "draft" },
    select: { id: true, metaJson: true },
  });

  if (!draft) {
    return NextResponse.json(
      { error: "Draft plan not found" },
      { status: 404 },
    );
  }

  const acceptedMetaJson = markAccepted(draft.metaJson);

  const program = await prisma.$transaction(async (tx) => {
    await tx.program.updateMany({
      where: { userId, status: "active" },
      data: { status: "replaced" },
    });

    return tx.program.update({
      where: { id: draft.id },
      data: {
        status: "active",
        metaJson: acceptedMetaJson,
      },
      select: { id: true, status: true },
    });
  });

  return NextResponse.json({
    accepted: true,
    programId: program.id,
    status: program.status,
  });
}

function markAccepted(metaJson: unknown): Prisma.InputJsonValue {
  const acceptedAt = new Date().toISOString();
  const meta = isRecord(metaJson) ? { ...metaJson } : {};
  const safetyRetry = isRecord(meta.safetyRetry)
    ? { ...meta.safetyRetry, acceptedAt }
    : (meta.safetyRetry ?? null);

  return {
    ...meta,
    acceptedAt,
    safetyRetry,
  } as Prisma.InputJsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
