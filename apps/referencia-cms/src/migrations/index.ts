import * as migration_20260924_112918_inicial from './20260924_112918_inicial';
import * as migration_20260924_234833_agenda_snapshot from './20260924_234833_agenda_snapshot';

export const migrations = [
  {
    up: migration_20260924_112918_inicial.up,
    down: migration_20260924_112918_inicial.down,
    name: '20260924_112918_inicial',
  },
  {
    up: migration_20260924_234833_agenda_snapshot.up,
    down: migration_20260924_234833_agenda_snapshot.down,
    name: '20260924_234833_agenda_snapshot',
  },
];
