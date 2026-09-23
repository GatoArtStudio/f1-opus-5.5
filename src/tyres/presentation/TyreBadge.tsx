import { toCssColor } from "@/shared/presentation/format";
import { COMPOUND_SPECS, type Compound } from "../domain/tyre";
import styles from "./tyre-badge.module.css";

/** A tyre as drawn on F1 broadcasts: a ring in the compound's colour around its letter. */
export function TyreBadge({ compound, size = 24 }: { compound: Compound; size?: number }) {
  const spec = COMPOUND_SPECS[compound];
  return (
    <span
      className={styles.badge}
      style={{ width: size, height: size, borderColor: toCssColor(spec.color), fontSize: size * 0.5 }}
      title={spec.label}
      aria-label={`Neumático ${spec.label}`}
    >
      {spec.short}
    </span>
  );
}
