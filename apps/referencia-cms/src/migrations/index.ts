import * as migration_20260924_112918_inicial from './20260924_112918_inicial';

export const migrations = [
  {
    up: migration_20260924_112918_inicial.up,
    down: migration_20260924_112918_inicial.down,
    name: '20260924_112918_inicial'
  },
];
