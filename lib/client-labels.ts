type Client = { id?: unknown; legalName?: unknown; createdAt?: unknown };
export function clientLabels(clients: Client[]): Record<string, string> {
  const groups = new Map<string, Client[]>();
  for (const client of clients) {
    const key = String(client.legalName || "").trim().toLocaleLowerCase("en-IN");
    groups.set(key, [...(groups.get(key) || []), client]);
  }
  const labels: Record<string, string> = {};
  for (const rows of groups.values()) {
    rows.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)));
    rows.forEach((row, index) => { labels[String(row.id)] = String(row.legalName || "Unnamed client") + (rows.length > 1 ? ` (Project ${index + 1})` : ""); });
  }
  return labels;
}
