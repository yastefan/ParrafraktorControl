// Knopf, der erst nach dem Halten auslöst – für die Übernahme, damit ein versehentliches
// Antippen nicht die Show übernimmt.
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";

interface Props {
  dauerMs: number;
  ausloesen: () => void;
  class?: string;
  disabled?: boolean;
  children: ComponentChildren;
}

export function HaltKnopf({ dauerMs, ausloesen, class: klasse, disabled, children }: Props) {
  const timer = useRef<number>();
  const [haelt, setHaelt] = useState(false);
  const los = () => {
    window.clearTimeout(timer.current);
    setHaelt(false);
  };
  return (
    <button
      type="button"
      class={`halt ${klasse ?? ""} ${haelt ? "haelt" : ""}`}
      style={{ "--dauer": `${dauerMs}ms` }}
      disabled={disabled}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setHaelt(true);
        timer.current = window.setTimeout(() => {
          setHaelt(false);
          ausloesen();
        }, dauerMs);
      }}
      onPointerUp={los}
      onPointerCancel={los}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
