/** Removes characters that have a meaning in PostgREST filters (commas, brackets, wildcards, quotes),
 *  so whatever the user types is always searched as plain text. */
export const cleanTerm = (s: string) => s.replace(/[%*,()\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
