// Button that only triggers after holding – for the output, so an accidental
// tap does not take over the show.
import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";

interface Props {
  durationMs: number;
  trigger: () => void;
  class?: string;
  disabled?: boolean;
  children: ComponentChildren;
}

export function HoldButton({ durationMs, trigger, class: className, disabled, children }: Props) {
  const timer = useRef<number>();
  const [holding, setHolding] = useState(false);
  const go = () => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  return (
    <button
      type="button"
      class={`halt ${className ?? ""} ${holding ? "haelt" : ""}`}
      style={{ "--dauer": `${durationMs}ms` }}
      disabled={disabled}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setHolding(true);
        timer.current = window.setTimeout(() => {
          setHolding(false);
          trigger();
        }, durationMs);
      }}
      onPointerUp={go}
      onPointerCancel={go}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
