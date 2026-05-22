export function MusardosLogo({ size = 32, withWordmark = false }: { size?: number; withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-md flex items-center justify-center font-bold text-white shrink-0"
        style={{ width: size, height: size, background: "var(--brand-blue)", fontSize: size * 0.55 }}
        aria-label="Musardos"
      >
        M
      </div>
      {withWordmark && (
        <span className="font-semibold text-foreground tracking-tight" style={{ fontSize: size * 0.55 }}>
          Musardos
        </span>
      )}
    </div>
  );
}
