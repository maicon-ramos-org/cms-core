/** O que as rotas e o middleware do tema leem do site (ver `tema.ts` e `config.ts`). */
declare module 'virtual:editorial/config' {
  const config: import('./config').ConfigDoEditorial
  export default config
}

/*
 * Os componentes substituíveis do tema (nível 2 do PRD 17 RF3): o do site quando ele troca,
 * o de `componentes/` quando não. Nenhum recebe props — leem o tenant de `Astro.locals`.
 */
declare module 'virtual:editorial/Cabecalho' {
  const Componente: typeof import('./componentes/Cabecalho.astro').default
  export default Componente
}
declare module 'virtual:editorial/Rodape' {
  const Componente: typeof import('./componentes/Rodape.astro').default
  export default Componente
}
declare module 'virtual:editorial/Fontes' {
  const Componente: typeof import('./componentes/Fontes.astro').default
  export default Componente
}
declare module 'virtual:editorial/Ferramentas' {
  const Componente: typeof import('./componentes/Ferramentas.astro').default
  export default Componente
}
declare module 'virtual:editorial/extensoes' {
  const extensoes: import('./extensoes').ExtensaoDoEditorial[]
  export default extensoes
}
