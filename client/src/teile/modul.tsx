// Rahmen eines Bereichs: abgeschrägte Ecken, farbiger Reiter mit Titel, rechts daneben Aktionen.
// Die Farbe kommt aus der Klasse (setzt --akzent), siehe stil.css.
import type { ComponentChildren } from "preact";

interface Props {
  titel: string;
  klasse: string;
  aktionen?: ComponentChildren;
  children: ComponentChildren;
}

export function Modul({ titel, klasse, aktionen, children }: Props) {
  return (
    <section class={`modul ${klasse}`}>
      <header class="modul-kopf">
        <h2>{titel}</h2>
        {aktionen && <div class="modul-aktionen">{aktionen}</div>}
      </header>
      <div class="modul-inhalt">{children}</div>
    </section>
  );
}
