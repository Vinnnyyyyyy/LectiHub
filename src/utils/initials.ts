/** Two-letter initials for the rail avatar. */
export function initialsFrom(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .filter((char): char is string => Boolean(char))

  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]! + parts[parts.length - 1]!).toUpperCase()
}
