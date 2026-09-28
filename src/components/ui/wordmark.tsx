export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display leading-none ${className}`} aria-label="Lane">
      Lane<span className="text-harbour">.</span>
    </span>
  );
}
