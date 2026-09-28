import { Wordmark } from "@/components/ui/wordmark";
import { signInWithGoogle } from "./actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-[12px] border border-hairline bg-card p-8 flex flex-col gap-6">
        <Wordmark className="text-3xl" />
        <div className="flex flex-col gap-2">
          <h1 className="display text-2xl leading-tight">
            Everything your owners need, in one place<span className="text-harbour">.</span>
          </h1>
          <p className="text-[15px] leading-relaxed text-ink-78">
            Sign in with your Lane Property Google account.
          </p>
        </div>
        {error ? (
          <p className="text-sm text-error" role="alert">
            {error === "domain"
              ? "Use your laneproperty.com.au account."
              : "Sign-in didn’t go through. Try again."}
          </p>
        ) : null}
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            className="h-12 w-full rounded-[6px] bg-navy text-on-navy text-[15px] font-semibold"
          >
            Continue with Google
          </button>
        </form>
      </div>
    </main>
  );
}
