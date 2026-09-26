import { APIError, ValidationError, type CollectionBeforeValidateHook, type Config } from 'payload'
import { temPapelSiteReader, tenantUnicoSiteReader } from './principal'

export const validaPrincipalSiteReader: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  const efetivo = { ...originalDoc, ...data }
  if (!temPapelSiteReader(efetivo)) return data
  if (!Array.isArray(efetivo.roles) || efetivo.roles.length !== 1 || efetivo.roles[0] !== 'site-reader') {
    throw new ValidationError({ collection: 'users', errors: [{ path: 'roles', message: 'Site reader exige exclusivamente o papel site-reader.' }] })
  }
  if (tenantUnicoSiteReader(efetivo.tenants) === null) {
    throw new ValidationError({ collection: 'users', errors: [{ path: 'tenants', message: 'Site reader exige exatamente um tenant válido, sem duplicatas.' }] })
  }
  return data
}

/** Último plugin da fábrica, depois de copiar campos; nunca modifica o Users de módulo. */
export function preparaPrincipalSiteReader(config: Config): Config {
  const users = config.collections?.find(c => c.slug === 'users')
  const roles = users?.fields.find(f => 'name' in f && f.name === 'roles')
  if (!users || !roles || roles.type !== 'select' || roles.hasMany !== true || roles.required !== true ||
    roles.hidden || roles.localized || roles.virtual || !users.auth) {
    throw new Error('siteReader exige users autenticável e roles select hasMany required, visível, não localizado nem virtual.')
  }
  if (!roles.options.some(o => (typeof o === 'string' ? o : o.value) === 'site-reader')) {
    roles.options = [...roles.options, { label: 'Site Reader (SSR)', value: 'site-reader' }]
  }
  users.hooks = {
    ...users.hooks,
    beforeValidate: [...(users.hooks?.beforeValidate ?? []), validaPrincipalSiteReader],
    beforeLogin: [({ user }) => {
      if (temPapelSiteReader(user)) throw new APIError('Acesso negado.', 403)
      return user
    }, ...(users.hooks?.beforeLogin ?? [])],
  }
  return config
}
