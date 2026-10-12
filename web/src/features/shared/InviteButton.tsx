import { ShareButton } from "../../components/ShareButton.tsx";
import { absoluteUrl, paths } from "./paths.ts";

/** Shares the session's join link. */
export function InviteButton({ session }: { session: { id: string; name: string } }) {
  return (
    <ShareButton
      title={session.name}
      text={`Join our Secret Santa "${session.name}"`}
      url={absoluteUrl(paths.join(session.id))}
    />
  );
}
