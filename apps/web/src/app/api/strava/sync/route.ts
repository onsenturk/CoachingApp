/**
 * POST /api/strava/sync — manually enqueue a Strava sync for the signed-in user.
 *
 * Webhook handler is `/api/strava/webhook` (Phase 2).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { stravaSyncQueue } from "@/server/queues";

export async function POST() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  await stravaSyncQueue.add("manual", { userId });
  return NextResponse.json({ enqueued: true });
}
