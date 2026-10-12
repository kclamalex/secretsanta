import type { InputHTMLAttributes } from "react";

/** <input type="number"> that hands back a number. */
export function NumberInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: number; onChange: (n: number) => void }) {
  return <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} {...props} />;
}
