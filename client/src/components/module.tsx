// Frame of an area: bevelled corners, coloured tab with the title, actions to the right.
// The colour comes from the class (sets --akzent), see style.css.
import type { ComponentChildren } from "preact";

interface Props {
  title: string;
  className: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
}

export function Module({ title, className, actions, children }: Props) {
  return (
    <section class={`modul ${className}`}>
      <header class="modul-kopf">
        <h2>{title}</h2>
        {actions && <div class="modul-aktionen">{actions}</div>}
      </header>
      <div class="modul-inhalt">{children}</div>
    </section>
  );
}
