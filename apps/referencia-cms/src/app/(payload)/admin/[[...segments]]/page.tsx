/* Integração mantida pela aplicação: página e metadata podem rodar antes do layout.
 * A regeneração deste arquivo deve passar por tests/site-reader-next.spec.ts. */
import type { Metadata } from 'next'

import config from '@payload-config'
import { leitorNoPreflightSiteReader } from '@maicon-ramos-org/cms-core/site-reader'
import { RootPage, generatePageMetadata } from '@payloadcms/next/views'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { importMap } from '../importMap'

type Args = {
  params: Promise<{
    segments: string[]
  }>
  searchParams: Promise<{
    [key: string]: string | string[]
  }>
}

export const generateMetadata = async ({ params, searchParams }: Args): Promise<Metadata> => {
  if (await leitorNoPreflightSiteReader({ config, headers: await headers() })) notFound()
  return generatePageMetadata({ config, params, searchParams })
}

const Page = async ({ params, searchParams }: Args) => {
  if (await leitorNoPreflightSiteReader({ config, headers: await headers() })) notFound()
  return RootPage({ config, params, searchParams, importMap })
}

export default Page
