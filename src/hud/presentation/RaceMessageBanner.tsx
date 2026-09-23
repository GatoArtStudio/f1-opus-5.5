import type { CSSProperties } from "react";
import type { RaceMessage } from "@/race/application/race-ui-state";
import styles from "./hud.module.css";

/** Re-mounted per message (keyed by id) so its CSS animation restarts. */
export function RaceMessageBanner({ message }: { message: RaceMessage }) {
  return (
    <div
      role="status"
      className={`${styles.message} ${styles[message.tone]}`}
      style={{ "--message-duration": `${message.seconds}s` } as CSSProperties}
    >
      {message.text}
    </div>
  );
}
