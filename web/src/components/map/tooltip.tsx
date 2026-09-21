import styles from "./tooltip.module.css";

export type TooltipState = { x: number; y: number; name: string; value: string } | null;

export function Tooltip({ state }: { state: TooltipState }) {
  if (!state) return null;
  return (
    <div className={styles.tooltip} style={{ left: state.x, top: state.y }} role="status">
      <strong>{state.name}</strong>
      <br />
      <span className="dato">{state.value}</span>
    </div>
  );
}
