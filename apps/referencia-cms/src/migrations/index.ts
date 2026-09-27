import * as migration_20260924_112918_inicial from './20260924_112918_inicial';
import * as migration_20260924_234833_agenda_snapshot from './20260924_234833_agenda_snapshot';
import * as migration_20260927_165242_pages_navegacao from './20260927_165242_pages_navegacao';

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
  {
    up: migration_20260927_165242_pages_navegacao.up,
    down: migration_20260927_165242_pages_navegacao.down,
    name: '20260927_165242_pages_navegacao',
  },
];
