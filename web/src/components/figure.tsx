import styles from "./figure.module.css";

export function Figure({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className={`dato ${styles.figura}`}>
      {value}
      {unit ? ` ${unit}` : null}
    </span>
  );
}
