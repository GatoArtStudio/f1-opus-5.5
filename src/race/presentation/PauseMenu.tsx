import overlay from "@/shared/presentation/overlay.module.css";

interface Props {
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
}

export function PauseMenu({ onResume, onRestart, onQuit }: Props) {
  return (
    <div className={overlay.overlay}>
      <div className={`${overlay.card} ${overlay.small}`}>
        <h2 className={overlay.heading}>PAUSA</h2>
        <button type="button" className={`${overlay.button} ${overlay.primary}`} onClick={onResume} autoFocus>
          Continuar
        </button>
        <button type="button" className={overlay.button} onClick={onRestart}>
          Reiniciar carrera
        </button>
        <button type="button" className={overlay.button} onClick={onQuit}>
          Menú principal
        </button>
      </div>
    </div>
  );
}
