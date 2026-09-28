import { Wordmark } from "@/components/ui/wordmark";
import { signOut } from "@/app/login/actions";

export const metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-[12px] border border-hairline bg-card p-8 flex flex-col gap-6">
        <Wordmark className="text-3xl" />
        <div className="flex flex-col gap-2">
          <h1 className="display text-2xl leading-tight">
            This account isn’t set up yet<span className="text-harbour">.</span>
          </h1>
          <p className="text-[15px] leading-relaxed text-ink-78">
            Ask a director to add you, then sign in again.
          </p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="h-12 w-full rounded-[6px] border border-hairline bg-card text-[15px] font-semibold"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
