import dotenv from 'dotenv';
dotenv.config();

const SITE_URL = (process.env.SITE_URL || 'https://vvleague.onrender.com').replace(/\/$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || '';

async function botFetch(path: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout
  try {
    const res = await fetch(`${SITE_URL}/api/bot${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-bot-key': BOT_API_KEY,
        ...(options.headers as Record<string, string> || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('Site did not respond in time (is it online?)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function searchOrgs(query: string): Promise<any[]> {
  return botFetch(`/orgs?q=${encodeURIComponent(query)}`);
}

export async function getAllOrgs(): Promise<any[]> {
  return botFetch('/orgs');
}

export async function searchPlayers(query: string): Promise<any[]> {
  return botFetch(`/players?q=${encodeURIComponent(query)}`);
}

export async function getAllPlayers(): Promise<any[]> {
  return botFetch('/players');
}

export async function getMemberByDiscordId(discordId: string): Promise<any | null> {
  try { return await botFetch(`/member/${discordId}`); }
  catch { return null; }
}

export async function signMember(orgId: number, discordId: string, name: string, role: string = 'Player'): Promise<{ id: number }> {
  return botFetch('/sign', { method: 'POST', body: JSON.stringify({ org_id: orgId, discord_id: discordId, name, role }) });
}

export async function releaseMember(discordId: string): Promise<{ ok: boolean; removed: number }> {
  return botFetch('/release', { method: 'POST', body: JSON.stringify({ discord_id: discordId }) });
}

export async function createOrg(tag: string, name: string, region: string, logoUrl?: string): Promise<{ id: number }> {
  return botFetch('/orgs', { method: 'POST', body: JSON.stringify({ tag, name, region, logo_url: logoUrl }) });
}

export async function deleteOrg(tag: string): Promise<{ ok: boolean }> {
  return botFetch(`/orgs/${encodeURIComponent(tag)}`, { method: 'DELETE' });
}

export async function setSigningOpen(tag: string, open: boolean): Promise<void> {
  await botFetch(`/orgs/${encodeURIComponent(tag)}/signing`, { method: 'PUT', body: JSON.stringify({ open }) });
}

export async function setOrgRole(tag: string, discordRoleId: string): Promise<void> {
  await botFetch(`/orgs/${encodeURIComponent(tag)}/role`, { method: 'PUT', body: JSON.stringify({ discord_role_id: discordRoleId }) });
}
