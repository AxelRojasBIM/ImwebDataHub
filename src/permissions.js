export function hasMenuAccess(rol, path) {
  return !!rol && (rol.accesoTotal || (rol.permisosMenu ?? []).includes(path))
}

export function firstAllowedPath(nav, rol) {
  for (const g of nav) for (const item of g.items) if (hasMenuAccess(rol, item.to)) return item.to
  return null
}
