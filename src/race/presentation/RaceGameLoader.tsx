"use client";

import dynamic from "next/dynamic";
import styles from "./race-game.module.css";

// three.js, WebGL and Web Audio only exist in the browser: skip prerendering.
const RaceGame = dynamic(() => import("./RaceGame"), {
  ssr: false,
  loading: () => <div className={styles.loading}>Cargando circuito…</div>,
});

export function RaceGameLoader() {
  return <RaceGame />;
}
