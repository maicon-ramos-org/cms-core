// um tema de mentira: duas rotas e um componente substituível
import { fileURLToPath } from 'node:url'

const aqui = (arquivo) => fileURLToPath(new URL(`./${arquivo}`, import.meta.url))

export const tema = {
  nome: 'tema-teste',
  rotas: [
    { pattern: '/', entrypoint: aqui('Home.astro') },
    { pattern: '/outra', entrypoint: aqui('Outra.astro') },
  ],
  componentes: { Cab: aqui('Cab.astro') },
}
