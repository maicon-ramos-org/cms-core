/// <reference types="astro/client" />

/** O tenant que o middleware do tema resolve pelo Host — o mesmo tipo que o tema declara. */
declare namespace App {
  interface Locals {
    tenant: import('@runzos/editorial/lib/cms').TenantDTO
  }
}
