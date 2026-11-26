import type { RaidBoss } from '../data/models';
import type { BossStatus } from '../domain/availability';
import { bossLabel, weatherName } from '../domain/names';
import { Picture } from './common';
import type { Sources } from './hooks';
import { StatusNote } from './RaidBoard';
import { BossHero } from './RaidStyles';

/** Ficha de un jefe de la lista de LeekDuck. */
export function BossSummary({ boss, sources, status }: { boss: RaidBoss; sources: Sources; status: BossStatus }) {
  const weather = boss.weather.length > 0 ? boss.weather.map(weatherName).join(' o ') : 'clima favorable';
  return (
    <BossHero
      label={bossLabel(boss, sources.translations.data)}
      types={boss.types}
      tier={boss.tier}
      shadow={boss.shadow}
      shiny={boss.shiny}
      figure={<Picture src={boss.image} className="rb-hero-img" />}
      status={<StatusNote status={status} />}
      cp={{
        normal: boss.cp ? `${boss.cp.min}–${boss.cp.max}` : 'no indicado',
        boosted: boss.boostedCp ? `${boss.boostedCp.min}–${boss.boostedCp.max}` : null,
        weather: `Con ${weather}`,
      }}
    />
  );
}
