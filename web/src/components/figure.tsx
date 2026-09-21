export function Figure({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="dato">
      {value}
      {unit ? ` ${unit}` : null}
    </span>
  );
}
