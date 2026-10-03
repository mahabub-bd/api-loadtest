export default function AppFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-surface px-4 py-2.5 text-xs text-ink-3 md:px-6">
      <span>Results are measured server-side — CORS and browser connection limits can't skew them.</span>
      <span className="hidden sm:inline">React + Vite · Node.js benchmark engine</span>
    </footer>
  );
}
