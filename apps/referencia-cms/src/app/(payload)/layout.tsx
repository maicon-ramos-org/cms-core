/* Integração mantida pela aplicação: reader não entra no layout nem na serverFunction.
 * A regeneração deste arquivo deve passar por tests/site-reader-next.spec.ts. */
import config from '@payload-config'
import { leitorNoPreflightSiteReader } from '@maicon-ramos-org/cms-core/site-reader'
import '@payloadcms/next/css'
import type { ServerFunctionClient } from 'payload'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import React from 'react'

import { importMap } from './admin/importMap.js'
import './custom.scss'

type Args = {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  if (await leitorNoPreflightSiteReader({ config, headers: await headers() })) notFound()
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  })
}

const Layout = async ({ children }: Args) => {
  if (await leitorNoPreflightSiteReader({ config, headers: await headers() })) notFound()
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  )
}

export default Layout
