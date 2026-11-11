import type { Product } from './catalog'

/** Name as people mean it: "Strawberries", "strawberry (from CRM p12)" and "Frozen Strawberry" all become "strawberry". */
export function normName(name: string) {
  let n = name.toLowerCase()
    .replace(/\(from crm[^)]*\)/g, '')
    .replace(/^frozen\s+|^iqf\s+|^fresh\s+/, '')
    .replace(/\s+jam$/, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim()
  n = n.split(' ').map((w) => w.replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/(?<!s)s$/, '')).join(' ')
  return n
}

/** Active products of the same type whose names mean the same thing. Biggest groups first. */
export function duplicateGroups(products: Product[]): Product[][] {
  const by = new Map<string, Product[]>()
  for (const p of products) {
    if (p.archived_at) continue
    const k = `${p.product_type}|${normName(p.name)}`
    by.set(k, [...(by.get(k) ?? []), p])
  }
  return [...by.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name))
}

/** Which one to keep by default: no "(from CRM …)" in the name, then the most packaging and varieties. */
export function suggestKeep(group: Product[]): Product {
  const score = (p: Product) => (/\(from crm/i.test(p.name) ? 0 : 1000) + p.product_packaging.filter((x) => !x.archived_at).length * 10 + p.varieties.length
  return [...group].sort((a, b) => score(b) - score(a))[0]
}
