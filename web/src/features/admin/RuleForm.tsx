import { useState, type FormEvent } from "react";
import type { Participant } from "../../api/types.ts";

/** "Giver can't get receiver", optionally both ways. */
export function RuleForm({
  participants,
  onAdd,
}: {
  participants: Participant[];
  onAdd: (giverId: number, receiverId: number, both: boolean) => Promise<boolean>;
}) {
  const [giver, setGiver] = useState("");
  const [receiver, setReceiver] = useState("");
  const [both, setBoth] = useState(true);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await onAdd(Number(giver), Number(receiver), both)) {
      setGiver("");
      setReceiver("");
    }
  };

  const options = (list: Participant[]) => list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);

  return (
    <form onSubmit={submit} className="rule-form">
      <select value={giver} onChange={(e) => setGiver(e.target.value)} aria-label="Giver">
        <option value="">Giver…</option>
        {options(participants)}
      </select>
      <span className="rule-word">can't get</span>
      <select value={receiver} onChange={(e) => setReceiver(e.target.value)} aria-label="Receiver">
        <option value="">Receiver…</option>
        {options(participants.filter((p) => String(p.id) !== giver))}
      </select>
      <label className="check">
        <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} /> both ways
      </label>
      <button type="submit" disabled={!giver || !receiver}>Add rule</button>
    </form>
  );
}
