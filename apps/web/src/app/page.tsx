import Link from "next/link";
import { signIn } from "@/auth";
import { Button, buttonClasses } from "@/components/Button";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-semibold">Coaching</h1>
      <p className="text-neutral-600">
        AI-assisted training plans for runners and cyclists, grounded in your Strava data.
        Daily check-ins drive readiness-aware adjustments.
      </p>
      <div className="flex flex-wrap gap-3">
        <form
          action={async () => {
            "use server";
            await signIn("strava", { redirectTo: "/dashboard" });
          }}
        >
          <Button type="submit" variant="primary" size="md">
            Connect with Strava
          </Button>
        </form>
        <Link href="/dashboard" className={buttonClasses({ variant: "ghost", size: "md" })}>
          Go to dashboard →
        </Link>
      </div>
    </main>
  );
}
