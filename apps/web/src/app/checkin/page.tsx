import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { CheckInForm } from "./form";
import { AppNavTabs } from "@/components/AppNavTabs";

export default async function CheckInPage() {
  const session = await auth();
  if (!session?.user) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <header className="mb-6 space-y-4">
        <h1 className="text-2xl font-semibold">Daily check-in</h1>
        <AppNavTabs />
      </header>
      <CheckInForm />
    </main>
  );
}
