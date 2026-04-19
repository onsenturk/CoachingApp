import Link from "next/link";
import { signIn } from "@/auth";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">Coaching</h1>
      <p className="text-neutral-600">
        AI-assisted training plans for runners and cyclists, grounded in your Strava data.
        Daily check-ins drive readiness-aware adjustments.
      </p>
      <div className="flex gap-3">
        <form
          action={async () => {
            "use server";
            await signIn("strava", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Connect with Strava
          </button>
        </form>
        <Link
          href="/dashboard"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
