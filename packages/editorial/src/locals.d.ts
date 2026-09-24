/// <reference types="astro/client" />

/** O tenant que o middleware resolve pelo Host e toda rota do tema lê. */
declare namespace App {
  interface Locals {
    tenant: import('./lib/cms').TenantDTO
  }
}
