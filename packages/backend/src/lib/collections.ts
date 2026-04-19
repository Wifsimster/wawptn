/** Index a list by a unique key extracted from each item. */
export function indexBy<T, K>(items: readonly T[], keyFn: (item: T) => K): Map<K, T> {
  const map = new Map<K, T>()
  for (const item of items) map.set(keyFn(item), item)
  return map
}

/** Group items into a Map keyed by the extracted key, preserving insertion order. */
export function groupBy<T, K>(items: readonly T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const key = keyFn(item)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}
