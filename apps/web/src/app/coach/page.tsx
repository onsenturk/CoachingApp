import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function CoachPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  const foundryConfigured = Boolean(process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT);
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Coach</h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/dashboard" className="underline">Dashboard</Link>
          <Link href="/calendar" className="underline">Calendar</Link>
        </nav>
      </header>
      <section className="rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-medium text-neutral-500">Status</h2>
        <p className="mt-2 text-sm">
          {foundryConfigured ? (
            <>
              Foundry endpoint detected. Conversational coach UI ships in
              Phase 2 — agent definitions in <code>agents/foundry-agents.json</code>.
            </>
          ) : (
            <>
              Coach is offline. Set{" "}
              <code>AZURE_FOUNDRY_PROJECT_ENDPOINT</code> in <code>.env</code>{" "}
              and run <code>pnpm agents:sync</code> to enable AI coaching.
            </>
          )}
        </p>
      </section>
    </main>
  );
}
