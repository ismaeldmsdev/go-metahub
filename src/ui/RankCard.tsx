import type { ComponentChildren } from 'preact';
import type { PokemonLabel } from '../domain/names';
import { PokemonName, Rank, TypeTag } from './common';

interface Props {
  label: PokemonLabel;
  types: string[];
  figure: ComponentChildren;
  rank?: number;
  tier?: ComponentChildren;
  chip?: ComponentChildren;
  moves?: ComponentChildren;
  children?: ComponentChildren;
  /** La cifra principal, siempre en la misma columna. */
  value?: { text: ComponentChildren; label: string; title?: string; note?: string | false };
  /** Las demás, en dos columnas fijas. */
  metrics?: [string, ComponentChildren][];
}

/** Ficha de clasificación: puesto y tier, texto, e ilustración con la cifra principal. */
export function RankCard({ label, types, figure, rank, tier, chip, moves, children, value, metrics = [] }: Props) {
  const side = rank !== undefined || tier;
  return (
    <li class={`card rank-card t-${types[0] ?? ''}${side ? '' : ' rank-wide'}`}>
      {side && (
        <div class="rank-side">
          {rank !== undefined && <Rank value={rank} />}
          {tier}
        </div>
      )}
      <div class="rank-body">
        <PokemonName label={label} />
        <div class="rank-meta">
          {chip}
          {types.map((type) => (
            <TypeTag key={type} type={type} />
          ))}
        </div>
        {moves && <ul class="moves">{moves}</ul>}
        {children}
        {metrics.length > 0 && (
          <dl class="metrics">
            {metrics.map(([name, text]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div class="rank-figure">
        {figure}
        {value && (
          <p class="score" title={value.title}>
            <b>{value.text}</b>
            <small>{value.label}</small>
            {value.note && <small class="tied">{value.note}</small>}
          </p>
        )}
      </div>
    </li>
  );
}
