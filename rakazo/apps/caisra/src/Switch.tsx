import "./switch.css";

/**
 * The switch. One of them, for the whole app.
 *
 * It exists because there were two. Settings drew the canvas's — 44 by 23, a
 * 19px knob, the off track at `rgba(0,0,0,.09)` — and Routines drew one of mine
 * at 40 by 22 with an 18px knob, and both called their parts `.toggle` and
 * `.toggle__knob`. Two stylesheets, one document: the second one loaded won,
 * and the settings knob inherited `position: absolute` from the routines rule
 * and flew to the corner of the screen.
 *
 * That was two faults with one cause. Renaming one of them would have fixed the
 * collision and left the app with two switches drawn to different numbers,
 * which is the fault that matters. So there is one, and it is the canvas's.
 */
export function Switch({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? "switch--on" : ""}`}
      onClick={onToggle}
    >
      <span className="switch__knob" />
    </button>
  );
}
