/** O que as rotas e o middleware do tema leem do site (ver `tema.ts` e `config.ts`). */
declare module 'virtual:editorial/config' {
  const config: import('./config').ConfigDoEditorial
  export default config
}
