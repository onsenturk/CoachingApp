"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Tap-first daily check-in.
 *
 * Goals:
 *  - Zero typing for the common case. Defaults are sensible; user adjusts only
 *    what differs from "normal".
 *  - Numeric inputs are replaced with segmented buttons / a slider.
 *  - Rarely-changed fields (resting HR, notes) are hidden behind "More".
 */
export function CheckInForm() {
  const router = useRouter();
  // Defaults chosen so a user can submit without touching anything.
  const [readiness, setReadiness] = useState<number>(7);
  const [sleepHours, setSleepHours] = useState<number>(7.5);
  const [sleepQuality, setSleepQuality] = useState<number>(4);
  const [soreness, setSoreness] = useState<number>(2);
  const [mood, setMood] = useState<number>(4);
  const [injured, setInjured] = useState(false);
  const [sick, setSick] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [restingHr, setRestingHr] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    const payload = {
      date: new Date().toISOString().slice(0, 10),
      readiness,
      sleepHours,
      sleepQuality,
      soreness,
      mood,
      injured,
      sick,
      restingHr,
      notes: notes || undefined,
    };
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const data = await res.json();
    setResult(`Readiness: ${data.assessment.level} → ${data.assessment.action}`);
    // Send the user back to the dashboard so they see the updated state.
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      <Section label="How ready do you feel?" hint={`${readiness}/10`}>
        <Scale10 value={readiness} onChange={setReadiness} />
      </Section>

      <Section label="Sleep" hint={`${sleepHours.toFixed(1)} h`}>
        <input
          type="range"
          min={4}
          max={10}
          step={0.5}
          value={sleepHours}
          onChange={(e) => setSleepHours(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-3">
          <Emoji5
            value={sleepQuality}
            onChange={setSleepQuality}
            options={["😵", "😪", "😐", "🙂", "😴"]}
            captions={["Awful", "Poor", "OK", "Good", "Great"]}
          />
        </div>
      </Section>

      <Section label="Soreness" hint={["None", "Mild", "Some", "High", "Severe"][soreness - 1]}>
        <Emoji5
          value={soreness}
          onChange={setSoreness}
          options={["💪", "🙂", "😐", "😣", "🤕"]}
          captions={["None", "Mild", "Some", "High", "Severe"]}
        />
      </Section>

      <Section label="Mood" hint={["Low", "Meh", "OK", "Good", "Great"][mood - 1]}>
        <Emoji5
          value={mood}
          onChange={setMood}
          options={["😞", "😕", "😐", "🙂", "😄"]}
          captions={["Low", "Meh", "OK", "Good", "Great"]}
        />
      </Section>

      <div className="flex gap-2">
        <Toggle active={injured} onClick={() => setInjured((v) => !v)} label="🤕 Injured" />
        <Toggle active={sick} onClick={() => setSick((v) => !v)} label="🤒 Sick" />
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-sm text-neutral-500 underline"
      >
        {showMore ? "Hide details" : "More details (optional)"}
      </button>

      {showMore && (
        <div className="space-y-4 rounded border border-neutral-200 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Resting HR (bpm)</span>
            <input
              type="number"
              min={20}
              max={140}
              value={restingHr ?? ""}
              onChange={(e) =>
                setRestingHr(e.target.value === "" ? undefined : Number(e.target.value))
              }
              className="w-full rounded border border-neutral-300 p-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded border border-neutral-300 p-2"
            />
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Submit check-in"}
      </button>
      {result && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{result}</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </form>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-neutral-700">{label}</span>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Scale10({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`rounded py-2 text-sm ${
            n === value
              ? "bg-neutral-900 text-white"
              : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Emoji5({
  value,
  onChange,
  options,
  captions,
}: {
  value: number;
  onChange: (v: number) => void;
  options: string[];
  captions: string[];
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {options.map((emoji, idx) => {
        const n = idx + 1;
        const active = n === value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={captions[idx]}
            className={`flex flex-col items-center rounded py-2 text-2xl ${
              active ? "bg-neutral-900 text-white" : "bg-neutral-100 hover:bg-neutral-200"
            }`}
          >
            <span>{emoji}</span>
            <span
              className={`mt-1 text-[10px] ${active ? "text-neutral-200" : "text-neutral-500"}`}
            >
              {captions[idx]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded border px-3 py-2 text-sm ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
    </button>
  );
}
