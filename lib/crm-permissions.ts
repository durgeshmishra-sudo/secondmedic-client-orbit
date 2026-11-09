export type MemberScope = { id: string; role: string; teamName: string; isActive: boolean };
export type ClientScope = { ownerMemberId: string | null; teamName: string };

export function canAccessClient(member: MemberScope, client: ClientScope, ownerTeam?: string | null) {
  if (!member.isActive) return false;
  if (member.role === "admin" || member.role === "manager") return true;
  if (member.id === client.ownerMemberId) return true;
  return member.role === "head" && Boolean(member.teamName) && member.teamName === (ownerTeam || client.teamName);
}
