import dotenv from 'dotenv';
dotenv.config();
const SITE_URL = (process.env.SITE_URL || 'https://vvleague.onrender.com').replace(/\/$/, '');
const BOT_API_KEY = process.env.BOT_API_KEY || '';
async function botFetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000); // 30s timeout
    try {
        const res = await fetch(`${SITE_URL}/api/bot${path}`, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'x-bot-key': BOT_API_KEY,
                ...(options.headers || {}),
            },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        return res.json();
    }
    catch (e) {
        if (e.name === 'AbortError')
            throw new Error('Site did not respond in time (is it online?)');
        throw e;
    }
    finally {
        clearTimeout(timer);
    }
}
export async function searchOrgs(query) {
    return botFetch(`/orgs?q=${encodeURIComponent(query)}`);
}
export async function getAllOrgs() {
    return botFetch('/orgs');
}
export async function searchPlayers(query) {
    return botFetch(`/players?q=${encodeURIComponent(query)}`);
}
export async function getAllPlayers() {
    return botFetch('/players');
}
export async function getMemberByDiscordId(discordId) {
    try {
        return await botFetch(`/member/${discordId}`);
    }
    catch {
        return null;
    }
}
export async function signMember(orgId, discordId, name, role = 'Player') {
    return botFetch('/sign', { method: 'POST', body: JSON.stringify({ org_id: orgId, discord_id: discordId, name, role }) });
}
export async function releaseMember(discordId) {
    return botFetch('/release', { method: 'POST', body: JSON.stringify({ discord_id: discordId }) });
}
export async function createOrg(tag, name, region, logoUrl, season) {
    return botFetch('/orgs', { method: 'POST', body: JSON.stringify({ tag, name, region, logo_url: logoUrl, founded: season || undefined }) });
}
export async function deleteOrg(tag) {
    return botFetch(`/orgs/${encodeURIComponent(tag)}`, { method: 'DELETE' });
}
export async function setSigningOpen(tag, open) {
    await botFetch(`/orgs/${encodeURIComponent(tag)}/signing`, { method: 'PUT', body: JSON.stringify({ open }) });
}
export async function setOrgRole(tag, discordRoleId) {
    await botFetch(`/orgs/${encodeURIComponent(tag)}/role`, { method: 'PUT', body: JSON.stringify({ discord_role_id: discordRoleId }) });
}
export async function setOrgFounded(tag, founded) {
    await botFetch(`/orgs/${encodeURIComponent(tag)}/founded`, { method: 'PUT', body: JSON.stringify({ founded }) });
}
export async function createWarLog(org1Tag, org2Tag, score1, score2, winnerTag, region, eloOrg1, eloOrg2, stats = null, season = '', mvp = '', notes = '') {
    const date = new Date().toISOString().slice(0, 10);
    return botFetch('/logs/war', {
        method: 'POST',
        body: JSON.stringify({ date, org1: org1Tag, org2: org2Tag, score1, score2, winner: winnerTag, region: region || 'NA', elo_org1: eloOrg1, elo_org2: eloOrg2, stats, season: season || '', mvp: mvp || '', notes: notes || '' }),
    });
}
export async function createWagerLog(challenger, challenged, amount, winner, season, stats = null) {
    const date = new Date().toISOString().slice(0, 10);
    return botFetch('/logs/wager', {
        method: 'POST',
        body: JSON.stringify({ date, challenger, challenged, amount, winner, season: season || '', stats }),
    });
}
export async function upsertWagerResult(discordId, name, org, eloDelta, won) {
    return botFetch('/players/wager-result', {
        method: 'POST',
        body: JSON.stringify({ discord_id: discordId, name, org, elo_delta: eloDelta, won }),
    });
}
//# sourceMappingURL=siteapi.js.map