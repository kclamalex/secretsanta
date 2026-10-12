import { useRef } from "react";
import { Avatar, type Person } from "./Avatar.tsx";
import { CameraIcon } from "./icons.tsx";

/** Round photo button with a camera badge. On iPhone the picker offers camera, library or files. */
export function PhotoPicker({ person, busy, onPick }: { person: Person; busy: boolean; onPick: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="photo-picker"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={person.avatarUrl ? "Change your photo" : "Add your photo"}
      >
        <Avatar person={person} size={88} />
        <span className="photo-badge" aria-hidden>{busy ? "…" : <CameraIcon size={15} />}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow picking the same file again
          if (file) onPick(file);
        }}
      />
    </>
  );
}
