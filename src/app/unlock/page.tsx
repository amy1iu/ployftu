import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PloyAvatar } from "@/components/ploy-avatar";
import { PASS_COOKIE, PASS_MAX_AGE, passKey, safeNext, samePassword, sitePassword } from "@/lib/site-password";

// The password page for the deployed demo (see src/proxy.ts): one field, no
// username. The right password sets the cookie and goes where they were headed.

async function unlock(formData: FormData) {
  "use server";
  const next = safeNext(formData.get("next"));
  const password = sitePassword();
  const given = String(formData.get("password") ?? "");
  if (password && !samePassword(given, password)) redirect(`/unlock?wrong=1${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`);
  if (password)
    (await cookies()).set(PASS_COOKIE, passKey(password), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: PASS_MAX_AGE,
      path: "/",
    });
  redirect(next);
}

export default async function UnlockPage({ searchParams }: PageProps<"/unlock">) {
  const { next, wrong } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <form action={unlock} className="w-full max-w-[320px] rounded-2xl border border-ink/15 bg-white p-6 text-center">
        <div className="flex justify-center">
          <PloyAvatar size={32} />
        </div>
        <h1 className="mt-4 text-[17px] font-medium text-ink">Enter the password</h1>
        <p className="mt-1 text-[13px] text-muted">This Ploy demo is private.</p>
        <input type="hidden" name="next" value={safeNext(next)} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          autoComplete="current-password"
          aria-label="Password"
          aria-invalid={!!wrong}
          placeholder="Password"
          className="mt-5 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-[14px] outline-none focus:border-ink/40"
        />
        {wrong && <p className="mt-2 text-left text-[12.5px] text-red-600">That&apos;s not it. Try again.</p>}
        <button type="submit" className="mt-4 w-full rounded-lg bg-ink py-2 text-[14px] font-medium text-white hover:opacity-90">
          Continue
        </button>
      </form>
    </main>
  );
}
