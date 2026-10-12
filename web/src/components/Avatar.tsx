export type Person = { name: string; avatarUrl: string | null };

/** Deep green, oxblood, navy, plum, bronze: all dark enough for cream initials. */
const JEWELS = ["#1f4a3a", "#6e1d1a", "#1f2f55", "#4a2444", "#6b4a20"];

/** Profile photo, or cream initials on a jewel tone when someone hasn't added one. */
export function Avatar({ person, size = 40, className = "" }: { person: Person; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (person.avatarUrl) {
    return <img src={person.avatarUrl} alt="" className={`avatar ${className}`} style={style} draggable={false} />;
  }
  const hash = [...person.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
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
      style={{ ...style, fontSize: size * 0.4, background: JEWELS[hash % JEWELS.length] }}
      aria-hidden
    >
      {initials || "?"}
    </span>
  );
}
