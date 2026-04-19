import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckInForm } from "./form";

export default async function CheckInPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-900">
          ← Dashboard
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold">Daily check-in</h1>
      <CheckInForm />
    </main>
  );
}
