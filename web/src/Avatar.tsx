type Person = { name: string; avatarUrl: string | null };

/** Profile photo, or colored initials when someone hasn't added one. */
export function Avatar({ person, size = 40, className = "" }: { person: Person; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (person.avatarUrl) {
    return <img src={person.avatarUrl} alt="" className={`avatar ${className}`} style={style} draggable={false} />;
  }
  const hue = [...person.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  const initials = person.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={`avatar initials ${className}`}
      style={{ ...style, fontSize: size * 0.4, background: `hsl(${hue} 55% 42%)` }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
