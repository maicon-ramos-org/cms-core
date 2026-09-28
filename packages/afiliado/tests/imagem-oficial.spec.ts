import { describe, expect, it } from 'vitest'

import { ProdutosFisicos, VariantesProduto } from '../src/cms/collections/CatalogoFisico'
import { Produtos } from '../src/cms/collections/Produtos'
import {
  normalizaURLImagemOficialAmazon,
  validaImagemOficialAmazon,
} from '../src/imagem-oficial'
import { imagemRenderizavel } from '../src/web/lib/imagem-oficial'

const oficial = 'https://m.media-amazon.com/images/I/71Produto._AC_SL1500_.jpg'
const args = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) => ({
  data,
  originalDoc,
  collection: { slug: 'produtos' },
}) as never

describe('URL da imagem oficial Amazon', () => {
  it('aceita somente o caminho oficial e remove query e fragmento', () => {
    expect(normalizaURLImagemOficialAmazon(`${oficial}?tag=nao-vai#foto`)).toBe(oficial)
    expect(normalizaURLImagemOficialAmazon('https://m.media-amazon.com/images/I/produto.webp')).toBe(
      'https://m.media-amazon.com/images/I/produto.webp',
    )
  })

  it.each([
    'http://m.media-amazon.com/images/I/produto.jpg',
    'https://media-amazon.com/images/I/produto.jpg',
    'https://m.media-amazon.com.br/images/I/produto.jpg',
    'https://images-na.ssl-images-amazon.com/images/I/produto.jpg',
    'https://m.media-amazon.com.evil.test/images/I/produto.jpg',
    'https://usuario@ m.media-amazon.com/images/I/produto.jpg',
    'https://usuario:senha@m.media-amazon.com/images/I/produto.jpg',
    'https://m.media-amazon.com:443/images/I/produto.jpg',
    'https://m.media-amazon.com:8443/images/I/produto.jpg',
    'https://m.media-amazon.com/image/I/produto.jpg',
    'https://m.media-amazon.com/images/I/produto.svg',
    'https://m.media-amazon.com/images/I/produto',
    ' https://m.media-amazon.com/images/I/produto.jpg',
    'não é URL',
  ])('rejeita host, protocolo, autoridade, caminho ou extensão fora do contrato: %s', (url) => {
    expect(() => normalizaURLImagemOficialAmazon(url)).toThrow()
  })

  it('exige proveniência válida junto da URL e canonicaliza antes de persistir', () => {
    const data = {
      imagem_oficial_url: `${oficial}?tracking=1#foto`,
      imagem_oficial_proveniencia: 'amazon-manual-revisado',
    }
    expect(validaImagemOficialAmazon(args(data))).toBe(data)
    expect(data.imagem_oficial_url).toBe(oficial)
    expect(() => validaImagemOficialAmazon(args({ imagem_oficial_url: oficial }))).toThrow(/imagem_oficial_proveniencia/i)
    expect(() => validaImagemOficialAmazon(args({
      imagem_oficial_url: oficial,
      imagem_oficial_proveniencia: 'concorrente',
    }))).toThrow(/imagem_oficial_proveniencia/i)
  })

  it('preserva PATCH parcial e permite documentos antigos sem os novos campos', () => {
    expect(() => validaImagemOficialAmazon(args({ titulo: 'Antigo' }, {}))).not.toThrow()
    const data = { titulo: 'Atualizado' }
    expect(validaImagemOficialAmazon(args(data, {
      imagem_oficial_url: oficial,
      imagem_oficial_proveniencia: 'amazon-pa-api',
    }))).toBe(data)
  })
})

describe('schema e renderização', () => {
  const nomes = (collection: typeof Produtos) => collection.fields.flatMap(field => 'name' in field ? [field.name] : [])

  it('expõe URL e proveniência no produto legado, produto físico e variante', () => {
    for (const collection of [Produtos, ProdutosFisicos, VariantesProduto]) {
      expect(nomes(collection)).toEqual(expect.arrayContaining(['imagem_oficial_url', 'imagem_oficial_proveniencia']))
      expect(collection.hooks?.beforeValidate).toContain(validaImagemOficialAmazon)
    }
  })

  it('prefere a URL oficial canonicalizada com dimensões fixas e alt tratado pelo Astro', () => {
    expect(imagemRenderizavel({
      imagem_oficial_url: `${oficial}?x=1`,
      imagem_oficial_proveniencia: 'amazon-pa-api',
      imagem: { url: '/fallback.jpg', width: 300, height: 200 },
    }, 'Produto <especial> & seguro', value => value ?? undefined)).toEqual({
      src: oficial,
      width: 640,
      height: 640,
      alt: 'Produto <especial> & seguro',
      remota: true,
    })
  })


  it('usa o upload atual se a URL ou a proveniência remota faltar ou vier inválida de dado legado', () => {
    const fallback = { url: '/fallback.jpg', width: 300, height: 200, alt: 'Alt existente' }
    for (const remoto of [
      {},
      { imagem_oficial_url: 'https://evil.test/images/I/foto.jpg', imagem_oficial_proveniencia: 'amazon-pa-api' as const },
      { imagem_oficial_url: oficial },
      { imagem_oficial_url: oficial, imagem_oficial_proveniencia: 'concorrente' as never },
    ]) {
      expect(imagemRenderizavel({ ...remoto, imagem: fallback }, 'Título', value => value ? `https://midia.test${value}` : undefined))
        .toMatchObject({ src: 'https://midia.test/fallback.jpg', width: 300, height: 200, alt: 'Alt existente', remota: false })
    }
  })

  it('o gate indexável aceita imagem oficial e continua rejeitando produto sem imagem', () => {
    const gate = Produtos.hooks!.beforeValidate!.at(-1)!
    const base = { estado: 'indexavel', gate_antithin: { alternativas: true, faq: true, editorial: true } }
    expect(() => gate(args({ ...base, imagem_oficial_url: oficial }))).not.toThrow()
    expect(() => gate(args(base))).toThrow(/imagem/)
  })
})
