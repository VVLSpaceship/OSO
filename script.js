// ============================================================
// STATIC DATA (non-DB sections)
// ============================================================
let UPCOMING_EVENTS = [
  { name: 'VVL Season 3 Grand Championship', region: 'ALL REGIONS', date: '2026-08-01T20:00:00' },
  { name: 'NA Regional Qualifier',           region: 'NA',          date: '2026-07-05T18:00:00' },
  { name: 'EU Open Cup',                     region: 'EU',          date: '2026-07-12T19:00:00' },
  { name: 'ASIA Invitational',               region: 'ASIA',        date: '2026-07-20T14:00:00' },
];

const DEFAULT_BRACKETS = {
  NA:   { qf:[{t1:'VVS',s1:3,t2:'TRX',s2:0,done:true},{t1:'NXS',s1:2,t2:'ABY',s2:3,done:true},{t1:'ZRO',s1:3,t2:'RVN',s2:1,done:true},{t1:'FRZ',s1:1,t2:'VLT',s2:3,done:true}], sf:[{t1:'VVS',s1:null,t2:'ABY',s2:null,done:false},{t1:'ZRO',s1:null,t2:'VLT',s2:null,done:false}], f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}], champion:null },
  EU:   { qf:[{t1:'FRZ',s1:3,t2:'EMP',s2:1,done:true},{t1:'VLT',s1:2,t2:'NOV',s2:3,done:true}], sf:[{t1:'FRZ',s1:null,t2:'NOV',s2:null,done:false}], f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}], champion:null },
  ASIA: { qf:[{t1:'SKY',s1:3,t2:'ZEN',s2:0,done:true},{t1:'ONI',s1:1,t2:'KRN',s2:3,done:true}], sf:[{t1:'SKY',s1:null,t2:'KRN',s2:null,done:false}], f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}], champion:null },
  OCE:  { qf:[{t1:'WVE',s1:3,t2:'CRL',s2:1,done:true}], sf:[{t1:'WVE',s1:null,t2:'DNG',s2:null,done:false}], f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}], champion:null },
  SA:   { qf:[{t1:'JGR',s1:3,t2:'CAP',s2:0,done:true},{t1:'AND',s1:2,t2:'SOL',s2:3,done:true}], sf:[{t1:'JGR',s1:null,t2:'SOL',s2:null,done:false}], f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}], champion:null },
};

const SCHEDULE = [
  {date:'2026-06-25',time:'18:00',match:'VVS vs ABY',          region:'NA',  round:'Semifinal',   status:'upcoming'},
  {date:'2026-06-25',time:'20:00',match:'ZRO vs VLT',          region:'NA',  round:'Semifinal',   status:'upcoming'},
  {date:'2026-06-26',time:'17:00',match:'FRZ vs NOV',          region:'EU',  round:'Semifinal',   status:'upcoming'},
  {date:'2026-06-27',time:'14:00',match:'SKY vs KRN',          region:'ASIA',round:'Semifinal',   status:'upcoming'},
  {date:'2026-06-27',time:'10:00',match:'WVE vs DNG',          region:'OCE', round:'Semifinal',   status:'upcoming'},
  {date:'2026-06-28',time:'19:00',match:'JGR vs SOL',          region:'SA',  round:'Semifinal',   status:'upcoming'},
  {date:'2026-07-05',time:'20:00',match:'NA Finals',           region:'NA',  round:'Final',       status:'upcoming'},
  {date:'2026-07-06',time:'19:00',match:'EU Finals',           region:'EU',  round:'Final',       status:'upcoming'},
  {date:'2026-07-07',time:'14:00',match:'ASIA Finals',         region:'ASIA',round:'Final',       status:'upcoming'},
  {date:'2026-07-07',time:'10:00',match:'OCE Finals',          region:'OCE', round:'Final',       status:'upcoming'},
  {date:'2026-07-08',time:'19:00',match:'SA Finals',           region:'SA',  round:'Final',       status:'upcoming'},
  {date:'2026-08-01',time:'20:00',match:'VVL S3 Championship', region:'ALL', round:'Grand Final', status:'upcoming'},
];

const DEFAULT_ELO_INFO = {
  description: 'The Off Season Elo system determines player rankings during the VVL pre-season. Points are calculated from ranked match results and opponent rating differences.',
  tiers: [
    {name:'BRONZE',  color:'#cd7f32', range:'0 — 999'},
    {name:'SILVER',  color:'#aaa',    range:'1000 — 1499'},
    {name:'GOLD',    color:'gold',    range:'1500 — 1999'},
    {name:'PLATINUM',color:'#00ccff', range:'2000 — 2499'},
    {name:'DIAMOND', color:'#aa44ff', range:'2500+'},
  ],
  gains: [
    {case:'Win vs higher ranked', value:'+32'},
    {case:'Win vs equal',         value:'+25'},
    {case:'Win vs lower ranked',  value:'+16'},
    {case:'Loss',                 value:'−20'},
  ],
};

// ============================================================
// STATE
// ============================================================
let BRACKETS       = JSON.parse(JSON.stringify(DEFAULT_BRACKETS));
let orgFilter      = 'all';
let statsSort      = 'wins';
let scheduleRegion = 'ALL';
let currentBracket = 'NA';
let currentBracketSeason = 'S1';
let bracketSeasons = ['S1'];
let currentGuildR  = 'NA';
let currentTeamR   = 'NA';
let cdEventIndex   = 0;
let cdInterval     = null;

// Admin
let isAdmin    = false;
let adminToken = sessionStorage.getItem('vvl_token') || null;
let userPerms  = 'all';

function hasPerm(perm) {
  if (!isAdmin) return false;
  if (userPerms === 'all') return true;
  return userPerms.split(',').map(p => p.trim()).includes(perm);
}

// Logs state
let warRegion    = 'ALL';
let seasonFilter = 'ALL';
let wagerStatus  = 'ALL';
let awardsSeasonSel = null;

// Dynamic data from API
let orgsData      = [];
let leaderboardData = [];
let guildsData    = {};
let teamsData     = {};
let scheduleData  = [];
let eloInfoData   = null;

// Pending delete / edit
let _deleteCtx = null;
let _editCtx   = null;

// ============================================================
// API HELPERS
// ============================================================
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (adminToken) opts.headers['Authorization'] = 'Bearer ' + adminToken;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  return res.json();
}
const apiGet    = (path)       => api('GET',    path);
const apiPost   = (path, body) => api('POST',   path, body);
const apiPut    = (path, body) => api('PUT',    path, body);
const apiDelete = (path)       => api('DELETE', path);

// ============================================================
// MAIN NAV
// ============================================================
function switchMain(tab) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('pg' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  if (tab === 'logs')    loadWarLogs();
  if (tab === 'awards')  loadAwards();
}

function switchSection(btn, sectionId) {
  const page = btn.closest('.page');
  page.querySelectorAll('.sec-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  page.querySelectorAll('.home-section').forEach(s => s.classList.remove('active'));
  page.querySelector('#' + sectionId).classList.add('active');
}

// ============================================================
// COUNTDOWN
// ============================================================
function initCountdown() {
  renderCountdownEvent(0);
  buildDots();
  tickCountdown();
  if (cdInterval) clearInterval(cdInterval);
  cdInterval = setInterval(tickCountdown, 1000);
}

function buildDots() {
  document.getElementById('upcomingDots').innerHTML = UPCOMING_EVENTS.map((_, i) =>
    `<div class="udot ${i===0?'active':''}" onclick="setCountdownEvent(${i})"></div>`
  ).join('');
}

function setCountdownEvent(i) {
  cdEventIndex = i;
  document.querySelectorAll('.udot').forEach((d, idx) => d.classList.toggle('active', idx === i));
  renderCountdownEvent(i);
}

function renderCountdownEvent(i) {
  const ev = UPCOMING_EVENTS[i];
  document.getElementById('countdownEventName').textContent   = ev.name.toUpperCase();
  document.getElementById('countdownEventRegion').textContent = '— ' + ev.region + ' —';
}

function tickCountdown() {
  const diff = new Date(UPCOMING_EVENTS[cdEventIndex].date) - new Date();
  if (diff <= 0) { ['cdDays','cdHours','cdMins','cdSecs'].forEach(id => document.getElementById(id).textContent = '00'); return; }
  document.getElementById('cdDays').textContent  = String(Math.floor(diff/86400000)).padStart(2,'0');
  document.getElementById('cdHours').textContent = String(Math.floor(diff%86400000/3600000)).padStart(2,'0');
  document.getElementById('cdMins').textContent  = String(Math.floor(diff%3600000/60000)).padStart(2,'0');
  document.getElementById('cdSecs').textContent  = String(Math.floor(diff%60000/1000)).padStart(2,'0');
}

// ============================================================
// ORGS — load & derive guilds/teams
// ============================================================
async function loadOrgs() {
  orgsData = await apiGet('/orgs');
  guildsData = buildGuildsFromOrgs(orgsData);
  teamsData  = buildTeamsFromOrgs(orgsData);
  renderOrgList();
  renderStats();
  renderGuilds();
  renderTeams();
  renderGuildLeaderboard();
}

function buildGuildsFromOrgs(orgs) {
  const regions = { NA:[], EU:[], ASIA:[], OCE:[], SA:[] };
  orgs.filter(o => o.status === 'active').forEach(o => {
    if (!regions[o.region]) return;
    const points = o.points || 0;
    regions[o.region].push({ tag:o.tag, name:o.name, icon:o.icon||o.tag.slice(0,2), wins:o.wins||0, members:o.members.length, points, rank:0 });
  });
  Object.keys(regions).forEach(r => {
    regions[r].sort((a,b) => b.points - a.points);
    regions[r].forEach((g,i) => g.rank = i+1);
  });
  return regions;
}

function buildTeamsFromOrgs(orgs) {
  const regions = { NA:[], EU:[], ASIA:[], OCE:[], SA:[] };
  orgs.forEach(o => {
    if (!regions[o.region]) return;
    regions[o.region].push({ tag:o.tag, name:o.name, icon:o.icon||o.tag.slice(0,2), region:o.region, players:o.members.length, record:`${o.wins||0}-${o.losses||0}`, rank:'#?' });
  });
  Object.keys(regions).forEach(r => {
    regions[r].sort((a,b) => {
      const [wa,la] = a.record.split('-').map(Number);
      const [wb,lb] = b.record.split('-').map(Number);
      return (wb - lb) - (wa - la);
    });
    regions[r].forEach((t,i) => t.rank = `#${i+1}`);
  });
  return regions;
}

// ============================================================
// ORG SEARCH
// ============================================================
function setOrgFilter(btn, f) {
  orgFilter = f;
  document.querySelectorAll('#secOrgs .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderOrgList();
}

function renderOrgList() {
  const q = (document.getElementById('orgSearchInput').value || '').toLowerCase().trim();
  const list = document.getElementById('orgList'), empty = document.getElementById('orgEmpty');
  const filtered = orgsData.filter(o => {
    const mf = orgFilter === 'all' || o.status === orgFilter;
    const mq = !q || o.name.toLowerCase().includes(q) || o.tag.toLowerCase().includes(q);
    return mf && mq;
  });
  if (!filtered.length) { list.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  list.innerHTML = filtered.map(o => {
    const editBtns = hasPerm('orgs')
      ? `<button class="tbl-btn" onclick="event.stopPropagation();openOrgForm(${JSON.stringify(o).replace(/"/g,'&quot;')})">✎</button><button class="tbl-btn del" onclick="event.stopPropagation();confirmDelete('org',${o.id})">✕</button>`
      : '';
    return `
      <div class="org-card" onclick="openOrgModal(${o.id})">
        ${o.logo_url ? `<img src="${o.logo_url}" alt="${o.tag}" class="org-avatar" style="object-fit:contain;padding:2px;">` : `<div class="org-avatar">${o.tag.slice(0,2)}</div>`}
        <div class="org-info">
          <div class="org-name">${o.name}</div>
          <div class="org-meta">[${o.tag}] · ${o.members.length} members · ${o.region} · Since ${o.founded}</div>
        </div>
        <span class="org-badge ${o.status==='active'?'badge-active':'badge-inactive'}">${o.status==='active'?'ACTIVE':'INACTIVE'}</span>
        ${editBtns}
        <span class="org-chevron">›</span>
      </div>`;
  }).join('');
}

// ============================================================
// ORG MODAL
// ============================================================
function openOrgModal(id) {
  const o = orgsData.find(x => x.id === id); if (!o) return;
  const wr = o.wins+o.losses > 0 ? ((o.wins/(o.wins+o.losses))*100).toFixed(0)+'%' : '—';
  const wagerStr = o.wager ? '$'+Number(o.wager).toLocaleString() : '—';
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-org-header">
      ${o.logo_url ? `<img src="${o.logo_url}" alt="${o.tag}" style="width:52px;height:52px;object-fit:contain;border-radius:6px;flex-shrink:0;">` : `<div class="modal-org-avatar">${o.tag.slice(0,2)}</div>`}
      <div><div class="modal-org-name">${o.name}</div><div class="modal-org-tag">[${o.tag}] · ${o.region} · ${o.status==='active'?'● ACTIVE':'○ INACTIVE'} · Since ${o.founded}</div></div>
    </div>
    <div class="modal-stats-grid">
      <div class="modal-stat"><div class="modal-stat-label">Wins</div><div class="modal-stat-value stat-green">${o.wins}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Losses</div><div class="modal-stat-value stat-red">${o.losses}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Winrate</div><div class="modal-stat-value">${wr}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Events Won</div><div class="modal-stat-value" style="color:var(--yellow)">${o.wonEvents}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Members</div><div class="modal-stat-value">${o.members.length}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Wager</div><div class="modal-stat-value wager-cell">${wagerStr}</div></div>
    </div>
    <div class="modal-stat" style="margin-bottom:.8rem;"><div class="modal-stat-label">MVP Player</div><div class="modal-stat-value" style="color:var(--yellow);">⭐ ${o.mvp||'—'}</div></div>
    <div class="modal-section-title">ROSTER</div>
    <div>${o.members.map(m=>`<div class="modal-member-row"><span>${m.name}</span><span class="member-role">${m.role.toUpperCase()}</span></div>`).join('')}</div>`;
  document.getElementById('orgModal').classList.add('open');
}
function closeOrgModal() { document.getElementById('orgModal').classList.remove('open'); }
function maybeCloseModal(e) { if (e.target===document.getElementById('orgModal')) closeOrgModal(); }

// ============================================================
// SEASON STATS
// ============================================================
function sortStats(btn, key) {
  statsSort = key;
  document.querySelectorAll('.sort-row .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderStats();
}

function renderStats() {
  const sortMap = {
    wins:    (a,b) => (b.wins-b.losses)-(a.wins-a.losses),
    events:  (a,b) => b.wonEvents-a.wonEvents,
    members: (a,b) => b.members.length-a.members.length,
    wager:   (a,b) => (parseFloat(b.wager)||0)-(parseFloat(a.wager)||0),
  };
  const sorted = [...orgsData].sort(sortMap[statsSort]||sortMap.wins);
  document.getElementById('statsBody').innerHTML = sorted.map((o,i) => {
    const r=i+1, rc=r<=3?`rank-${r}`:'', rm=r<=3?['①','②','③'][r-1]:r;
    const wagerStr = o.wager ? '$'+Number(o.wager).toLocaleString() : '—';
    return `<tr class="${rc}"><td class="rank-cell">${rm}</td><td class="org-name-cell">${o.name}</td><td><span class="stat-wins">${o.wins}W</span>&nbsp;<span style="opacity:.4">/</span>&nbsp;<span class="stat-losses">${o.losses}L</span></td><td style="color:var(--yellow)">${o.wonEvents}</td><td>${o.members.length}</td><td class="mvp-cell">${o.mvp||'—'}</td><td class="wager-cell">${wagerStr}</td></tr>`;
  }).join('');
}

// ============================================================
// GUILDS + TEAMS
// ============================================================
function switchRegionGuild(btn, r) {
  currentGuildR = r;
  document.querySelectorAll('#guildRegionTabs .rtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); renderGuilds();
}
function renderGuilds() {
  document.getElementById('guildGrid').innerHTML = (guildsData[currentGuildR]||[]).map(g => `
    <div class="guild-card">
      <div class="guild-rank">RANK #${g.rank}</div>
      <div class="guild-icon">${g.icon}</div>
      <div class="guild-name">${g.name}</div>
      <div class="guild-tag">[${g.tag}]</div>
      <div class="guild-stats">
        <div class="guild-stat"><span>${g.wins}</span><label>WINS</label></div>
        <div class="guild-stat"><span>${g.members}</span><label>MEMBERS</label></div>
        <div class="guild-stat"><span>${g.points.toLocaleString()}</span><label>POINTS</label></div>
      </div>
    </div>`).join('');
}

function switchRegionTeam(btn, r) {
  currentTeamR = r;
  document.querySelectorAll('#teamRegionTabs .rtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); renderTeams();
}
function renderTeams() {
  document.getElementById('teamGrid').innerHTML = (teamsData[currentTeamR]||[]).map(t => `
    <div class="team-card">
      <div class="team-card-header">
        <div class="team-icon">${t.icon}</div>
        <div><div class="team-name">${t.name}</div><div class="team-region">[${t.tag}] · ${t.region}</div></div>
      </div>
      <div class="team-row"><span>Rank</span><span>${t.rank}</span></div>
      <div class="team-row"><span>Record</span><span>${t.record}</span></div>
      <div class="team-row"><span>Players</span><span>${t.players}</span></div>
    </div>`).join('');
}

// ============================================================
// BRACKETS
// ============================================================
async function loadBracketSeasons() {
  try { bracketSeasons = await apiGet('/brackets/seasons'); } catch(e) { bracketSeasons = ['S1']; }
  if (!Array.isArray(bracketSeasons) || !bracketSeasons.length) bracketSeasons = ['S1'];
  bracketSeasons.sort((a, b) => (parseInt(a.replace(/\D/g,''))||0) - (parseInt(b.replace(/\D/g,''))||0));
  if (!bracketSeasons.includes(currentBracketSeason)) currentBracketSeason = bracketSeasons[bracketSeasons.length - 1];
  renderBracketSeasonTabs();
}

function renderBracketSeasonTabs() {
  const wrap = document.getElementById('bracketSeasonTabs');
  if (!wrap) return;
  wrap.innerHTML = bracketSeasons.map(s => {
    const delBtn = hasPerm('brackets')
      ? `<button class="tbl-btn del" onclick="deleteBracketSeason('${s}')" style="padding:.1rem .4rem;font-size:.65rem;margin-left:2px;vertical-align:middle;" title="Delete season">✕</button>`
      : '';
    return `<button class="rtab ${s===currentBracketSeason?'active':''}" onclick="switchBracketSeason(this,'${s}')">${s}</button>${delBtn}`;
  }).join('');
}

async function switchBracketSeason(btn, season) {
  document.querySelectorAll('#bracketSeasonTabs .rtab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  await loadBracketsFromAPI(season);
}

async function deleteBracketSeason(season) {
  if (!confirm(`Delete season "${season}" and all its brackets? This cannot be undone.`)) return;
  await apiDelete('/brackets/season/' + season);
  await loadBracketSeasons();
  await loadBracketsFromAPI();
}

async function loadBracketsFromAPI(season) {
  const s = season || currentBracketSeason;
  currentBracketSeason = s;
  const emptyBr = () => ({qf:[], sf:[], f:[{t1:'TBD',s1:null,t2:'TBD',s2:null,done:false}], champion:null});
  BRACKETS = {};
  ['NA','EU','ASIA','OCE','SA'].forEach(r => { BRACKETS[r] = emptyBr(); });
  try {
    const data = await apiGet('/brackets?season=' + s);
    if (data && typeof data === 'object' && !data.error) {
      Object.keys(data).forEach(r => { BRACKETS[r] = data[r]; });
    }
  } catch(e) {}
  renderBracketRegionTabs();
  renderBracket();
}

function openNewBracketForm() {
  document.getElementById('logFormContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1rem;">
      <div class="admin-modal-icon">+</div>
      <div class="admin-modal-title">NEW BRACKET</div>
    </div>
    <div class="admin-form-grid-2">
      <div class="admin-field"><label class="admin-label">SEASON</label><input id="nb_season" class="admin-input" value="" placeholder="S4, S5..."></div>
      <div class="admin-field"><label class="admin-label">REGION</label><select id="nb_region" class="admin-select">
        ${['NA','EU','ASIA','OCE','SA'].map(r=>`<option>${r}</option>`).join('')}
      </select></div>
      <div class="admin-field"><label class="admin-label">QF MATCHES</label><input id="nb_qf" type="number" min="0" max="8" class="admin-input" value="4"></div>
      <div class="admin-field"><label class="admin-label">SF MATCHES</label><input id="nb_sf" type="number" min="0" max="4" class="admin-input" value="2"></div>
      <div class="admin-field" style="grid-column:span 2;"><label class="admin-label">FINAL MATCHES</label><input id="nb_f" type="number" min="1" max="2" class="admin-input" value="1"></div>
    </div>
    <div class="admin-modal-actions">
      <button class="admin-submit-btn" onclick="saveNewBracket()">CREATE</button>
      <button class="admin-cancel-btn" onclick="closeLogForm()">CANCEL</button>
    </div>`;
  document.getElementById('logFormModal').classList.add('open');
}

async function saveNewBracket() {
  const season = g('nb_season').trim(), region = g('nb_region');
  if (!season) return;
  const em = () => ({t1:'TBD',t2:'TBD',s1:null,s2:null,done:false});
  const data = {
    qf: Array.from({length:parseInt(g('nb_qf'))||0}, em),
    sf: Array.from({length:parseInt(g('nb_sf'))||0}, em),
    f:  Array.from({length:Math.max(1,parseInt(g('nb_f'))||1)}, em),
    champion: null,
  };
  await apiPost('/brackets', { region, season, data });
  closeLogForm();
  if (!bracketSeasons.includes(season)) { bracketSeasons.push(season); bracketSeasons.sort((a,b)=>(parseInt(a.replace(/\D/g,''))||0)-(parseInt(b.replace(/\D/g,''))||0)); renderBracketSeasonTabs(); }
  await loadBracketsFromAPI(season);
}

async function addBracketMatch(region, roundKey) {
  if (!BRACKETS[region][roundKey]) BRACKETS[region][roundKey] = [];
  BRACKETS[region][roundKey].push({t1:'TBD',t2:'TBD',s1:null,s2:null,done:false});
  await apiPut('/brackets/'+region+'?season='+currentBracketSeason, BRACKETS[region]);
  renderBracket();
}

async function deleteBracketMatch(region, roundKey, idx) {
  BRACKETS[region][roundKey].splice(idx, 1);
  await apiPut('/brackets/'+region+'?season='+currentBracketSeason, BRACKETS[region]);
  renderBracket();
}

function renderBracketRegionTabs() {
  const wrap = document.getElementById('bracketRegionTabs');
  if (!wrap) return;
  const regions = ['NA','EU','ASIA','OCE','SA'];
  wrap.innerHTML = regions.map(r => {
    const isActive = r === currentBracket;
    const displayName = BRACKETS[r]?.regionName || r;
    if (isActive && hasPerm('brackets')) {
      return `<input class="region-name-input" value="${displayName.replace(/"/g,'&quot;')}" size="${Math.max(displayName.length,3)}"
        onblur="saveBracketRegionName('${r}',this.value)"
        onkeydown="if(event.key==='Enter')this.blur();"
        onclick="event.stopPropagation()">`;
    }
    return `<button class="rtab ${isActive?'active':''}" onclick="switchBracket(null,'${r}')">${displayName}</button>`;
  }).join('');
}

async function saveBracketRegionName(region, name) {
  const br = BRACKETS[region]; if (!br) return;
  br.regionName = name.trim() || region;
  await apiPut('/brackets/'+region+'?season='+currentBracketSeason, br);
  renderBracketRegionTabs();
}

function switchBracket(_btn, region) {
  currentBracket = region;
  renderBracketRegionTabs();
  renderBracket();
}

function renderBracket() {
  const br = BRACKETS[currentBracket]; if (!br) return;
  function matchHtml(m, rk, idx) {
    if (!m) return '';
    const t1w = m.done && m.s1!==null && m.s1>m.s2;
    const t2w = m.done && m.s2!==null && m.s2>m.s1;
    const t1c = m.t1==='TBD'?'tbd':(m.done?(t1w?'winner':(t2w?'loser':'filled')):'filled');
    const t2c = m.t2==='TBD'?'tbd':(m.done?(t2w?'winner':(t1w?'loser':'filled')):'filled');
    const delBtn = hasPerm('brackets') ? `<button class="tbl-btn del" style="font-size:.6rem;padding:.1rem .35rem;line-height:1;" onclick="event.stopPropagation();deleteBracketMatch('${currentBracket}','${rk}',${idx})">✕</button>` : '';
    return `<div class="bracket-match ${hasPerm('brackets')?'admin-editable':''}">
      <div class="bracket-team ${t1c}"><span class="bt-name">${m.t1}</span><span class="bt-score">${m.done&&m.s1!==null?m.s1:'—'}</span></div>
      <div class="bracket-team ${t2c}"><span class="bt-name">${m.t2}</span><span class="bt-score">${m.done&&m.s2!==null?m.s2:'—'}</span></div>
      ${hasPerm('brackets')?`<div class="admin-edit-hint" style="display:flex;justify-content:space-between;align-items:center;padding:.15rem .4rem;cursor:pointer;" onclick="openMatchEdit('${currentBracket}','${rk}',${idx})">✎ EDIT${delBtn}</div>`:''}
    </div>`;
  }
  const allRounds = [{key:'qf',label:'QUARTERFINALS'},{key:'sf',label:'SEMIFINALS'},{key:'f',label:'FINALS'},{key:'gf',label:'GRAND FINALS'}];
  const rounds = hasPerm('brackets') ? allRounds : allRounds.filter(r=>br[r.key]&&br[r.key].length);
  const champBtn = hasPerm('brackets') ? `<button class="admin-champion-btn" onclick="openChampionEdit('${currentBracket}')">✎ SET</button>` : '';
  function roundLabelHtml(key, defaultLabel) {
    const val = (br.labels&&br.labels[key]) || defaultLabel;
    if (hasPerm('brackets')) return `<div class="round-label" style="display:flex;align-items:center;justify-content:center;gap:.4rem;" id="rl_wrap_${key}">
      <span>${val}</span>
      <button class="rl-edit-btn" onclick="startEditRoundLabel(this,'${currentBracket}','${key}','${defaultLabel}')">✎</button>
    </div>`;
    return `<div class="round-label">${val}</div>`;
  }
  const champLabel = (br.labels&&br.labels['champion'])||'CHAMPION';
  const champLabelHtml = hasPerm('brackets')
    ? `<div class="round-label" style="display:flex;align-items:center;justify-content:center;gap:.4rem;" id="rl_wrap_champion">
        <span>${champLabel}</span>
        <button class="rl-edit-btn" onclick="startEditRoundLabel(this,'${currentBracket}','champion','CHAMPION')">✎</button>
      </div>`
    : `<div class="round-label">${champLabel}</div>`;
  document.getElementById('bracketView').innerHTML = `
    <div class="bracket">
      ${rounds.map(r=>`
        <div class="bracket-round">
          ${roundLabelHtml(r.key, r.label)}
          <div class="round-matches">
            ${(br[r.key]||[]).map((m,i)=>matchHtml(m,r.key,i)).join('')}
            ${hasPerm('brackets')?`<button class="admin-cancel-btn" style="width:100%;margin-top:.4rem;font-size:.7rem;padding:.35rem;" onclick="addBracketMatch('${currentBracket}','${r.key}')">+ ADD MATCH</button>`:''}
          </div>
        </div>`).join('')}
      <div class="bracket-round">${champLabelHtml}<div class="round-matches"><div class="champion-box"><div class="champion-label">🏆 Winner</div><div class="champion-name">${br.champion||'TBD'}</div>${champBtn}</div></div></div>
    </div>`;
}

// ============================================================
// SCHEDULE
// ============================================================
function filterSchedule(btn, region) {
  scheduleRegion = region;
  document.querySelectorAll('#secSchedule .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); renderSchedule();
}

async function loadSchedule() {
  try { scheduleData = await apiGet('/schedule'); } catch(e) { scheduleData = []; }
  renderSchedule();
  updateCountdownFromSchedule();
}

function updateCountdownFromSchedule() {
  const upcoming = scheduleData
    .filter(s => s.status === 'upcoming')
    .slice(0, 6)
    .map(s => ({
      name:   s.match.toUpperCase(),
      region: s.region,
      date:   s.date + 'T' + (s.time || '00:00') + ':00',
    }));
  if (!upcoming.length) return;
  UPCOMING_EVENTS.length = 0;
  upcoming.forEach(e => UPCOMING_EVENTS.push(e));
  cdEventIndex = 0;
  buildDots();
  renderCountdownEvent(0);
}

function renderSchedule() {
  const data = scheduleRegion === 'ALL'
    ? scheduleData
    : scheduleData.filter(s => s.region === scheduleRegion || s.region === 'ALL');
  const actTh = document.getElementById('schedActTh');
  if (actTh) actTh.style.display = hasPerm('schedule') ? '' : 'none';
  document.getElementById('scheduleBody').innerHTML = data.map(s => {
    const sc = s.status==='live'?'status-live':s.status==='done'?'status-done':'status-upcoming';
    const sl = s.status==='live'?'🔴 LIVE':s.status==='done'?'DONE':'UPCOMING';
    const adminBtns = hasPerm('schedule')
      ? `<td><button class="tbl-btn" onclick="openScheduleForm(${JSON.stringify(s).replace(/"/g,'&quot;')})">✎</button><button class="tbl-btn del" onclick="confirmDelete('schedule',${s.id})">✕</button></td>`
      : '';
    return `<tr><td>${s.date}</td><td>${s.time}</td><td style="color:var(--blue);font-weight:600;">${s.match}</td><td><span class="org-badge badge-active" style="font-size:.65rem;">${s.region}</span></td><td style="color:var(--text);opacity:.7">${s.round}</td><td class="${sc}">${sl}</td>${adminBtns}</tr>`;
  }).join('');
}

function openScheduleForm(existing) {
  const e = existing || {}, isEdit = !!e.id;
  const regions = ['ALL','NA','EU','ASIA','OCE','SA'];
  document.getElementById('logFormContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1rem;">
      <div class="admin-modal-icon">${isEdit?'✎':'+'}</div>
      <div class="admin-modal-title">${isEdit?'EDIT':'ADD'} SCHEDULE</div>
    </div>
    <div class="admin-form-grid-2">
      <div class="admin-field"><label class="admin-label">DATE</label><input id="sf_date" type="date" class="admin-input" value="${e.date||''}"></div>
      <div class="admin-field"><label class="admin-label">TIME (UTC)</label><input id="sf_time" class="admin-input" value="${e.time||''}" placeholder="18:00"></div>
      <div class="admin-field" style="grid-column:span 2;"><label class="admin-label">MATCH</label><input id="sf_match" class="admin-input" value="${e.match||''}" placeholder="VVS vs NXS"></div>
      <div class="admin-field"><label class="admin-label">REGION</label><select id="sf_region" class="admin-select">${regions.map(r=>`<option ${(e.region||'ALL')===r?'selected':''}>${r}</option>`).join('')}</select></div>
      <div class="admin-field"><label class="admin-label">ROUND</label><input id="sf_round" class="admin-input" value="${e.round||''}" placeholder="Semifinal, Final..."></div>
      <div class="admin-field"><label class="admin-label">STATUS</label><select id="sf_status" class="admin-select">
        <option value="upcoming" ${(!e.status||e.status==='upcoming')?'selected':''}>UPCOMING</option>
        <option value="live" ${e.status==='live'?'selected':''}>LIVE</option>
        <option value="done" ${e.status==='done'?'selected':''}>DONE</option>
      </select></div>
      <div class="admin-field"><label class="admin-label">SEASON</label><input id="sf_season" class="admin-input" value="${e.season||'S3'}" placeholder="S1, S2, S3..."></div>
    </div>
    <div class="admin-modal-actions">
      <button class="admin-submit-btn" onclick="saveScheduleForm(${e.id||'null'})">SAVE</button>
      <button class="admin-cancel-btn" onclick="closeLogForm()">CANCEL</button>
    </div>`;
  document.getElementById('logFormModal').classList.add('open');
}

async function saveScheduleForm(id) {
  const body = { date:g('sf_date'), time:g('sf_time'), match:g('sf_match'), region:g('sf_region'), round:g('sf_round'), status:g('sf_status'), season:g('sf_season') };
  if (!body.date || !body.match) return;
  id ? await apiPut('/schedule/'+id, body) : await apiPost('/schedule', body);
  closeLogForm();
  await loadSchedule();
}

// ============================================================
// ELO INFO
// ============================================================
async function loadEloInfo() {
  try {
    const data = await apiGet('/rules/elo_info');
    eloInfoData = data.content ? JSON.parse(data.content) : DEFAULT_ELO_INFO;
  } catch(e) { eloInfoData = DEFAULT_ELO_INFO; }
  renderEloInfo();
}

function renderEloInfo() {
  const info = eloInfoData || DEFAULT_ELO_INFO;
  const el = document.getElementById('eloInfoContent');
  if (!el) return;
  el.innerHTML = `
    <h3>OFF SEASON ELO SYSTEM</h3>
    <p>${info.description}</p>
    <h3>TIERS</h3>
    <div class="elo-tiers">
      ${info.tiers.map(t=>`<div class="elo-tier" style="--tc:${t.color}"><span class="tier-name">${t.name}</span><span class="tier-range">${t.range}</span></div>`).join('')}
    </div>
    <h3>ELO GAINS / LOSSES</h3>
    <div class="elo-rules">
      ${info.gains.map(gn=>{const pos=!String(gn.value).startsWith('−')&&!String(gn.value).startsWith('-');return`<div class="elo-rule"><span class="elo-case">${gn.case}</span><span class="${pos?'stat-green':'stat-red'}">${gn.value}</span></div>`;}).join('')}
    </div>`;
}

function _collectEloForm() {
  const tiers = [], gains = [];
  document.querySelectorAll('#ei_tiers > div').forEach((_, i) => {
    const name = g('ei_tier_name_'+i);
    if (name) tiers.push({name, color: g('ei_tier_color_'+i), range: g('ei_tier_range_'+i)});
  });
  document.querySelectorAll('#ei_gains > div').forEach((_, i) => {
    const c = g('ei_gain_case_'+i);
    if (c) gains.push({case: c, value: g('ei_gain_val_'+i)});
  });
  const desc = document.getElementById('ei_desc');
  return { description: desc ? desc.value : (eloInfoData||DEFAULT_ELO_INFO).description, tiers, gains };
}

function openEloInfoEditor() {
  const info = eloInfoData || DEFAULT_ELO_INFO;
  document.getElementById('logFormContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1rem;">
      <div class="admin-modal-icon">✎</div>
      <div class="admin-modal-title">EDIT ELO INFO</div>
    </div>
    <div class="admin-field" style="margin-bottom:.7rem;">
      <label class="admin-label">DESCRIPTION</label>
      <textarea id="ei_desc" class="admin-textarea">${info.description}</textarea>
    </div>
    <div class="admin-label" style="margin:.4rem 0;">TIERS</div>
    <div id="ei_tiers">
      ${info.tiers.map((t,i)=>`
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:.4rem;margin-bottom:.3rem;">
          <input class="admin-input" id="ei_tier_name_${i}" value="${t.name}" placeholder="Nome">
          <input class="admin-input" id="ei_tier_color_${i}" value="${t.color}" placeholder="#cor">
          <input class="admin-input" id="ei_tier_range_${i}" value="${t.range}" placeholder="0 — 999">
          <button class="tbl-btn del" onclick="removeEloTier(${i})">✕</button>
        </div>`).join('')}
    </div>
    <button class="admin-cancel-btn" style="width:100%;margin-bottom:.8rem;" onclick="addEloTier()">+ ADD TIER</button>
    <div class="admin-label" style="margin:.4rem 0;">ELO GAINS / LOSSES</div>
    <div id="ei_gains">
      ${info.gains.map((gn,i)=>`
        <div style="display:grid;grid-template-columns:1fr 6rem auto;gap:.4rem;margin-bottom:.3rem;">
          <input class="admin-input" id="ei_gain_case_${i}" value="${gn.case}" placeholder="Descrição">
          <input class="admin-input" id="ei_gain_val_${i}" value="${gn.value}" placeholder="+25">
          <button class="tbl-btn del" onclick="removeEloGain(${i})">✕</button>
        </div>`).join('')}
    </div>
    <button class="admin-cancel-btn" style="width:100%;margin-bottom:.8rem;" onclick="addEloGain()">+ ADD RULE</button>
    <div class="admin-modal-actions">
      <button class="admin-submit-btn" onclick="saveEloInfo()">SAVE</button>
      <button class="admin-cancel-btn" onclick="closeLogForm()">CANCEL</button>
    </div>`;
  document.getElementById('logFormModal').classList.add('open');
}

function removeEloTier(i)  { const info=_collectEloForm(); info.tiers.splice(i,1);  eloInfoData=info; openEloInfoEditor(); }
function addEloTier()       { const info=_collectEloForm(); info.tiers.push({name:'NEW',color:'#ffffff',range:'0 — 0'}); eloInfoData=info; openEloInfoEditor(); }
function removeEloGain(i)  { const info=_collectEloForm(); info.gains.splice(i,1);  eloInfoData=info; openEloInfoEditor(); }
function addEloGain()       { const info=_collectEloForm(); info.gains.push({case:'New rule',value:'+0'}); eloInfoData=info; openEloInfoEditor(); }

async function saveEloInfo() {
  const info = _collectEloForm();
  await apiPut('/rules/elo_info', { content: JSON.stringify(info) });
  eloInfoData = info;
  closeLogForm();
  renderEloInfo();
}

// ============================================================
// GUILD LEADERBOARD
// ============================================================
function renderGuildLeaderboard() {
  const el = document.getElementById('guildLbBody');
  if (!el) return;
  const sorted = [...orgsData].sort((a,b) => (b.points||0) - (a.points||0));
  el.innerHTML = sorted.map((o,i) => {
    const points = o.points || 0;
    const rc = i<3?`lb-rank-${i+1}`:'', rd = i<3?['①','②','③'][i]:i+1;
    return `<tr class="${rc}">
      <td class="lb-rank">${rd}</td>
      <td style="font-weight:600">${o.icon||''} ${o.name}</td>
      <td style="color:rgba(160,200,255,.5);font-size:.85rem;">[${o.tag}]</td>
      <td style="color:var(--yellow);font-weight:700">${points.toLocaleString()}</td>
      <td style="font-size:.85rem;"><span class="stat-wins">${o.wins||0}W</span>&nbsp;<span style="opacity:.4">/</span>&nbsp;<span class="stat-losses">${o.losses||0}L</span></td>
      <td style="color:var(--yellow)">${o.wonEvents||0}</td>
      <td>${o.members.length}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// LEADERBOARD
// ============================================================
async function loadLeaderboard() {
  leaderboardData = await apiGet('/players');
  renderLeaderboard();
}

function getEloTier(elo) {
  if (elo>=2500) return {label:'DIAMOND', cls:'tier-diamond'};
  if (elo>=2000) return {label:'PLATINUM',cls:'tier-platinum'};
  if (elo>=1500) return {label:'GOLD',    cls:'tier-gold'};
  if (elo>=1000) return {label:'SILVER',  cls:'tier-silver'};
  return               {label:'BRONZE',  cls:'tier-bronze'};
}

function renderLeaderboard() {
  const q = (document.getElementById('lbSearch').value||'').toLowerCase().trim();
  const data = leaderboardData.filter(p=>!q||p.name.toLowerCase().includes(q)||p.org.toLowerCase().includes(q));
  const actTh = document.getElementById('lbActTh');
  if (actTh) actTh.style.display = hasPerm('orgs') ? '' : 'none';
  document.getElementById('lbBody').innerHTML = data.map((p,i) => {
    const rc=i<3?`lb-rank-${i+1}`:'', rd=i<3?['①','②','③'][i]:i+1, t=getEloTier(p.elo);
    const adminBtns = hasPerm('orgs')
      ? `<td><button class="tbl-btn" onclick="openPlayerForm(${JSON.stringify(p).replace(/"/g,'&quot;')})">✎</button><button class="tbl-btn del" onclick="confirmDelete('player',${p.id})">✕</button></td>`
      : '';
    return `<tr class="${rc}"><td class="lb-rank">${rd}</td><td style="font-weight:600">${p.name}</td><td style="color:rgba(160,200,255,.5);font-size:.85rem;">[${p.org}]</td><td class="lb-elo">${p.elo}</td><td><span class="tier-badge ${t.cls}">${t.label}</span></td><td style="font-size:.85rem;"><span class="stat-wins">${p.wins}W</span>&nbsp;<span style="opacity:.4">/</span>&nbsp;<span class="stat-losses">${p.losses}L</span></td>${adminBtns}</tr>`;
  }).join('');
}

// ============================================================
// ADMIN AUTH
// ============================================================
function toggleAdminPanel() {
  if (isAdmin) return;
  document.getElementById('adminLoginModal').classList.add('open');
  setTimeout(() => document.getElementById('adminUser').focus(), 80);
}

function closeAdminLogin() {
  document.getElementById('adminLoginModal').classList.remove('open');
  document.getElementById('adminUser').value = '';
  document.getElementById('adminPass').value = '';
  document.getElementById('loginError').style.display = 'none';
}
function maybeCloseAdminModal(e) { if (e.target===document.getElementById('adminLoginModal')) closeAdminLogin(); }

async function attemptLogin() {
  const u = document.getElementById('adminUser').value.trim();
  const p = document.getElementById('adminPass').value;
  const errEl = document.getElementById('loginError');
  try {
    const res = await apiPost('/auth/login', { username: u, password: p });
    if (res.token) {
      adminToken = res.token;
      sessionStorage.setItem('vvl_token', adminToken);
      isAdmin = true;
      userPerms = res.perms || 'all';
      closeAdminLogin();
      setAdminUI(true);
      renderBracket();
    } else {
      errEl.style.display = '';
      document.getElementById('adminPass').value = '';
      setTimeout(() => errEl.style.display='none', 3000);
    }
  } catch(e) { errEl.style.display = ''; setTimeout(() => errEl.style.display='none', 3000); }
}

function adminLogout() {
  isAdmin = false;
  adminToken = null;
  sessionStorage.removeItem('vvl_token');
  setAdminUI(false);
  renderBracket();
  refreshAdminButtons();
}

function setAdminUI(on) {
  document.getElementById('adminLockBtn').textContent  = on ? '🔓' : '🔒';
  document.getElementById('adminLockBtn').title        = on ? 'Admin Active' : 'Admin Login';
  document.getElementById('adminBadge').style.display  = on ? '' : 'none';
  document.getElementById('adminLogoutBtn').style.display = on ? '' : 'none';
  refreshAdminButtons();
  renderBracketSeasonTabs();
  if (on) { renderOrgList(); renderLeaderboard(); renderSchedule(); }
}

function refreshAdminButtons() {
  const btnPerms = {
    addWarLogBtn: 'logs', addSeasonLogBtn: 'logs',
    addWagerBtn: 'wager',
    addAwardBtn: 'awards',
    editHomeRulesBtn: 'all', editLogsRulesBtn: 'all', editEloInfoBtn: 'all',
    addOrgBtn: 'orgs', addPlayerBtn: 'orgs',
    addScheduleBtn: 'schedule',
    newBracketBtn: 'brackets',
  };
  Object.entries(btnPerms).forEach(([id, perm]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = hasPerm(perm) ? '' : 'none';
  });
  const thPerms = { warActTh: 'logs', seasonActTh: 'logs', wagerActTh: 'wager', lbActTh: 'orgs', schedActTh: 'schedule' };
  Object.entries(thPerms).forEach(([id, perm]) => {
    const el = document.getElementById(id);
    if (el) el.style.display = hasPerm(perm) ? '' : 'none';
  });
  const mub = document.getElementById('manageUsersBtn');
  if (mub) mub.style.display = hasPerm('all') ? '' : 'none';
}

async function verifyStoredToken() {
  if (!adminToken) return;
  try {
    const res = await apiGet('/auth/verify');
    if (res.valid) { isAdmin = true; userPerms = res.perms || 'all'; setAdminUI(true); }
    else { adminToken = null; sessionStorage.removeItem('vvl_token'); }
  } catch(e) { adminToken = null; sessionStorage.removeItem('vvl_token'); }
}

// ============================================================
// BRACKET EDIT (admin)
// ============================================================
function openMatchEdit(region, roundKey, idx) {
  if (!hasPerm('brackets')) return;
  _editCtx = { region, roundKey, idx, type:'match' };
  const m = BRACKETS[region][roundKey][idx];
  document.getElementById('matchEditContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1.2rem;">
      <div class="admin-modal-icon">✎</div>
      <div class="admin-modal-title">EDIT MATCH</div>
      <div class="admin-modal-sub">${region} — ${roundKey.toUpperCase()} #${idx+1}</div>
    </div>
    <div class="admin-edit-grid">
      <div class="admin-field"><label class="admin-label">TEAM 1</label><input id="eT1" class="admin-input" value="${m.t1}"></div>
      <div class="admin-field"><label class="admin-label">SCORE 1</label><input id="eS1" type="number" min="0" class="admin-input" value="${m.s1??''}"></div>
      <div class="admin-field"><label class="admin-label">TEAM 2</label><input id="eT2" class="admin-input" value="${m.t2}"></div>
      <div class="admin-field"><label class="admin-label">SCORE 2</label><input id="eS2" type="number" min="0" class="admin-input" value="${m.s2??''}"></div>
    </div>
    <div class="admin-checkbox-row"><input type="checkbox" id="eDone" ${m.done?'checked':''}><label for="eDone">Mark as completed</label></div>
    <div class="admin-modal-actions"><button class="admin-submit-btn" onclick="saveMatchEdit()">SAVE</button><button class="admin-cancel-btn" onclick="closeMatchEdit()">CANCEL</button></div>`;
  document.getElementById('matchEditModal').classList.add('open');
}

async function saveMatchEdit() {
  const { region, roundKey, idx } = _editCtx;
  const s1v = document.getElementById('eS1').value, s2v = document.getElementById('eS2').value;
  const m = { t1:document.getElementById('eT1').value.trim()||'TBD', t2:document.getElementById('eT2').value.trim()||'TBD', s1:s1v!==''?parseInt(s1v):null, s2:s2v!==''?parseInt(s2v):null, done:document.getElementById('eDone').checked };
  BRACKETS[region][roundKey][idx] = m;
  await apiPut('/brackets/'+region+'?season='+currentBracketSeason, BRACKETS[region]);
  closeMatchEdit(); renderBracket();
}

function closeMatchEdit() { document.getElementById('matchEditModal').classList.remove('open'); _editCtx=null; }
function maybeCloseMatchModal(e) { if (e.target===document.getElementById('matchEditModal')) closeMatchEdit(); }

function openChampionEdit(region) {
  if (!hasPerm('brackets')) return;
  _editCtx = { region, type:'champion' };
  document.getElementById('matchEditContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1.2rem;">
      <div class="admin-modal-icon">🏆</div>
      <div class="admin-modal-title">SET CHAMPION</div>
      <div class="admin-modal-sub">${region} Region</div>
    </div>
    <div class="admin-field" style="margin-bottom:1rem;"><label class="admin-label">CHAMPION NAME</label><input id="eChamp" class="admin-input" value="${BRACKETS[region].champion||''}" placeholder="Team name or leave blank"></div>
    <div class="admin-modal-actions"><button class="admin-submit-btn" onclick="saveChampion('${region}')">SAVE</button><button class="admin-cancel-btn" onclick="closeMatchEdit()">CANCEL</button></div>`;
  document.getElementById('matchEditModal').classList.add('open');
}

async function saveChampion(region) {
  BRACKETS[region].champion = document.getElementById('eChamp').value.trim()||null;
  await apiPut('/brackets/'+region+'?season='+currentBracketSeason, BRACKETS[region]);
  closeMatchEdit(); renderBracket();
}

async function saveBracketLabel(region, key, val) {
  const br = BRACKETS[region]; if (!br) return;
  if (!br.labels) br.labels = {};
  const defaults = {qf:'QUARTERFINALS',sf:'SEMIFINALS',f:'FINALS',gf:'GRAND FINALS',champion:'CHAMPION'};
  br.labels[key] = val.trim() || defaults[key] || key.toUpperCase();
  await apiPut('/brackets/'+region+'?season='+currentBracketSeason, br);
  renderBracket();
}

function startEditRoundLabel(btn, region, key, defaultLabel) {
  const wrap = btn.closest('.round-label');
  const currentVal = (BRACKETS[region]?.labels?.[key]) || defaultLabel;
  wrap.innerHTML = `
    <input class="round-label-input" id="rl_input_${key}" value="${currentVal.replace(/"/g,'&quot;')}"
      onkeydown="if(event.key==='Enter')saveRoundLabelInline('${region}','${key}','${defaultLabel}');"
      style="flex:1;margin-bottom:0;">
    <button class="rl-save-btn" onclick="saveRoundLabelInline('${region}','${key}','${defaultLabel}')">SAVE</button>`;
  const inp = document.getElementById('rl_input_'+key);
  if (inp) { inp.focus(); inp.select(); }
}

async function saveRoundLabelInline(region, key, defaultLabel) {
  const inp = document.getElementById('rl_input_'+key);
  await saveBracketLabel(region, key, inp?.value || defaultLabel);
}

// ============================================================
// WAR LOGS
// ============================================================
function setWarFilter(btn, _key, val) {
  warRegion = val;
  document.querySelectorAll('#secWarLogs .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadWarLogs();
}

async function loadWarLogs() {
  const loadEl = document.getElementById('warLogsLoading'), emptyEl = document.getElementById('warLogsEmpty'), body = document.getElementById('warLogsBody');
  loadEl.style.display=''; emptyEl.style.display='none'; body.innerHTML='';
  const params = warRegion!=='ALL' ? '?region='+warRegion : '';
  const data = await apiGet('/logs/war'+params);
  loadEl.style.display='none';
  if (!data.length) { emptyEl.style.display=''; return; }
  body.innerHTML = data.map(r => {
    const actBtns = hasPerm('logs') ? `<td><button class="tbl-btn" onclick="openLogForm('war',${JSON.stringify(r).replace(/"/g,'&quot;')})">✎</button><button class="tbl-btn del" onclick="confirmDelete('war',${r.id})">✕</button></td>` : '';
    const eloHtml = (r.elo_org1 == null && r.elo_org2 == null) ? '—' :
      `<span class="${r.elo_org1>0?'stat-wins':r.elo_org1<0?'stat-losses':''}">${r.elo_org1!=null?(r.elo_org1>0?'+':'')+r.elo_org1:'—'}</span>&nbsp;/&nbsp;<span class="${r.elo_org2>0?'stat-wins':r.elo_org2<0?'stat-losses':''}">${r.elo_org2!=null?(r.elo_org2>0?'+':'')+r.elo_org2:'—'}</span>`;
    return `<tr>
      <td>${r.date}</td>
      <td style="color:var(--blue);font-weight:600;">${r.org1} vs ${r.org2}</td>
      <td><span class="stat-wins">${r.score1}</span>&nbsp;—&nbsp;<span class="stat-losses">${r.score2}</span></td>
      <td style="color:var(--yellow);font-weight:600;">${r.winner||'—'}</td>
      <td class="wager-cell">${r.wager?(isNaN(r.wager)?r.wager:'$'+Number(r.wager).toLocaleString()):'—'}</td>
      <td style="font-size:.85rem;white-space:nowrap;">${eloHtml}</td>
      <td><span class="org-badge badge-active" style="font-size:.62rem;">${r.region}</span></td>
      <td style="color:rgba(160,200,255,.5)">${r.season}</td>
      <td style="color:var(--text);opacity:.65;font-size:.82rem;">${r.notes||'—'}</td>
      ${actBtns}
    </tr>`;
  }).join('');
  refreshAdminButtons();
}

// ============================================================
// SEASON LOGS
// ============================================================
function buildSeasonFilterBtns(seasons) {
  const wrap = document.getElementById('seasonLogSeasonBtns');
  const allSeasons = ['ALL', ...seasons];
  wrap.innerHTML = allSeasons.map(s =>
    `<button class="filter-btn ${s===seasonFilter?'active':''}" onclick="setSeasonLogFilter(this,'${s}')">${s}</button>`
  ).join('');
}

function setSeasonLogFilter(btn, s) {
  seasonFilter = s;
  document.querySelectorAll('#secSeasonLogs .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadSeasonLogs();
}

async function loadSeasonLogs() {
  const loadEl=document.getElementById('seasonLogsLoading'), emptyEl=document.getElementById('seasonLogsEmpty'), body=document.getElementById('seasonLogsBody');
  loadEl.style.display=''; emptyEl.style.display='none'; body.innerHTML='';
  const params = seasonFilter!=='ALL' ? '?season='+encodeURIComponent(seasonFilter) : '';
  const [data, allData] = await Promise.all([
    apiGet('/logs/season'+params),
    seasonFilter!=='ALL' ? apiGet('/logs/season') : Promise.resolve(null),
  ]);
  const seasons = [...new Set((allData||data).map(r=>r.season))].sort().reverse();
  buildSeasonFilterBtns(seasons);
  loadEl.style.display='none';
  if (!data.length) { emptyEl.style.display=''; return; }
  body.innerHTML = data.map(r => {
    const actBtns = hasPerm('logs') ? `<td><button class="tbl-btn" onclick="openLogForm('season',${JSON.stringify(r).replace(/"/g,'&quot;')})">✎</button><button class="tbl-btn del" onclick="confirmDelete('season',${r.id})">✕</button></td>` : '';
    return `<tr>
      <td>${r.date}</td>
      <td style="color:rgba(160,200,255,.6);font-size:.85rem;">${r.event_name||'—'}</td>
      <td style="color:var(--blue);font-weight:600;">${r.org1} vs ${r.org2}</td>
      <td><span class="stat-wins">${r.score1}</span>&nbsp;—&nbsp;<span class="stat-losses">${r.score2}</span></td>
      <td style="color:var(--yellow);font-weight:600;">${r.winner||'—'}</td>
      <td><span class="org-badge badge-active" style="font-size:.62rem;">${r.region}</span></td>
      <td style="color:rgba(160,200,255,.5)">${r.season}</td>
      <td style="color:var(--text);opacity:.65;font-size:.82rem;">${r.notes||'—'}</td>
      ${actBtns}
    </tr>`;
  }).join('');
  refreshAdminButtons();
}

// ============================================================
// WAGER RECORDS
// ============================================================
function setWagerFilter(btn, s) {
  wagerStatus = s;
  document.querySelectorAll('#secWagerRecords .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadWagerRecords();
}

async function loadWagerRecords() {
  const loadEl=document.getElementById('wagerLoading'), emptyEl=document.getElementById('wagerEmpty'), body=document.getElementById('wagerBody');
  loadEl.style.display=''; emptyEl.style.display='none'; body.innerHTML='';
  const params = wagerStatus!=='ALL' ? '?status='+wagerStatus : '';
  const data = await apiGet('/logs/wager'+params);
  loadEl.style.display='none';
  if (!data.length) { emptyEl.style.display=''; return; }
  body.innerHTML = data.map(r => {
    const stCls = r.status==='settled'?'pill-settled':r.status==='cancelled'?'pill-cancelled':'pill-pending';
    const paidCls = r.paid ? 'pill-paid' : 'pill-unpaid';
    const actBtns = hasPerm('wager') ? `<td><button class="tbl-btn" onclick="openLogForm('wager',${JSON.stringify(r).replace(/"/g,'&quot;')})">✎</button><button class="tbl-btn del" onclick="confirmDelete('wager',${r.id})">✕</button></td>` : '';
    return `<tr>
      <td>${r.date}</td>
      <td style="color:var(--blue);font-weight:600;">${r.challenger}</td>
      <td style="color:var(--blue);font-weight:600;">${r.challenged}</td>
      <td class="wager-cell">${r.amount?(isNaN(r.amount)?r.amount:'$'+Number(r.amount).toLocaleString()):'—'}</td>
      <td style="color:var(--yellow);font-weight:600;">${r.winner||'—'}</td>
      <td><span class="status-pill ${stCls}">${r.status.toUpperCase()}</span></td>
      <td><span class="status-pill ${paidCls}">${r.paid?'PAID':'UNPAID'}</span></td>
      <td style="color:rgba(160,200,255,.5)">${r.season}</td>
      <td style="color:var(--text);opacity:.65;font-size:.82rem;">${r.notes||'—'}</td>
      ${actBtns}
    </tr>`;
  }).join('');
  refreshAdminButtons();
}

// ============================================================
// LOG FORM (Admin — War / Season / Wager)
// ============================================================
function openLogForm(type, existing) {
  const e = existing || {};
  const isEdit = !!e.id;
  const title = { war:'WAR LOG', season:'SEASON LOG', wager:'WAGER RECORD' }[type];
  let formHtml = '';

  if (type === 'war') {
    const orgSel = (id, val) => `<select id="${id}" class="admin-select">${orgsData.map(o=>`<option value="${o.tag}" ${val===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('')}</select>`;
    const winSel = (val) => `<select id="lf_winner" class="admin-select"><option value="">— NONE —</option>${orgsData.map(o=>`<option value="${o.tag}" ${val===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('')}</select>`;
    formHtml = `
      <div class="admin-form-grid-3">
        <div class="admin-field"><label class="admin-label">ORG 1</label>${orgSel('lf_org1', e.org1||'')}</div>
        <div class="admin-field"><label class="admin-label">S1</label><input id="lf_s1" type="number" min="0" class="admin-input" value="${e.score1??''}"></div>
        <div class="admin-field"><label class="admin-label">S2</label><input id="lf_s2" type="number" min="0" class="admin-input" value="${e.score2??''}"></div>
        <div class="admin-field"><label class="admin-label">ORG 2</label>${orgSel('lf_org2', e.org2||'')}</div>
      </div>
      <div class="admin-form-grid-2">
        <div class="admin-field"><label class="admin-label">DATE</label><input id="lf_date" type="date" class="admin-input" value="${e.date||''}"></div>
        <div class="admin-field"><label class="admin-label">WINNER</label>${winSel(e.winner||'')}</div>
        <div class="admin-field"><label class="admin-label">WAGER</label><input id="lf_wager" class="admin-input" value="${e.wager||''}" placeholder="ex: $500, items, custom..."></div>
        <div class="admin-field"><label class="admin-label">REGION</label><select id="lf_region" class="admin-select"><option ${e.region==='NA'?'selected':''}>NA</option><option ${e.region==='EU'?'selected':''}>EU</option><option ${e.region==='ASIA'?'selected':''}>ASIA</option><option ${e.region==='OCE'?'selected':''}>OCE</option><option ${e.region==='SA'?'selected':''}>SA</option></select></div>
        <div class="admin-field"><label class="admin-label">ELO ORG 1 (ex: +25 or -20)</label><input id="lf_elo1" type="number" class="admin-input" value="${e.elo_org1??''}" placeholder="optional"></div>
        <div class="admin-field"><label class="admin-label">ELO ORG 2 (ex: +25 or -20)</label><input id="lf_elo2" type="number" class="admin-input" value="${e.elo_org2??''}" placeholder="optional"></div>
        <div class="admin-field"><label class="admin-label">SEASON</label><input id="lf_season" class="admin-input" value="${e.season||'S3'}" placeholder="S1, S2, S3..."></div>
        <div class="admin-field"><label class="admin-label">NOTES</label><input id="lf_notes" class="admin-input" value="${e.notes||''}"></div>
      </div>`;
  } else if (type === 'season') {
    const orgSel = (id, val) => `<select id="${id}" class="admin-select">${orgsData.map(o=>`<option value="${o.tag}" ${val===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('')}</select>`;
    const winSel = (val) => `<select id="lf_winner" class="admin-select"><option value="">— NONE —</option>${orgsData.map(o=>`<option value="${o.tag}" ${val===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('')}</select>`;
    formHtml = `
      <div class="admin-form-grid-3">
        <div class="admin-field"><label class="admin-label">ORG 1</label>${orgSel('lf_org1', e.org1||'')}</div>
        <div class="admin-field"><label class="admin-label">S1</label><input id="lf_s1" type="number" min="0" class="admin-input" value="${e.score1??''}"></div>
        <div class="admin-field"><label class="admin-label">S2</label><input id="lf_s2" type="number" min="0" class="admin-input" value="${e.score2??''}"></div>
        <div class="admin-field"><label class="admin-label">ORG 2</label>${orgSel('lf_org2', e.org2||'')}</div>
      </div>
      <div class="admin-form-grid-2">
        <div class="admin-field"><label class="admin-label">DATE</label><input id="lf_date" type="date" class="admin-input" value="${e.date||''}"></div>
        <div class="admin-field"><label class="admin-label">EVENT NAME</label><input id="lf_event" class="admin-input" value="${e.event_name||''}"></div>
        <div class="admin-field"><label class="admin-label">WINNER</label>${winSel(e.winner||'')}</div>
        <div class="admin-field"><label class="admin-label">REGION</label><select id="lf_region" class="admin-select"><option ${e.region==='NA'?'selected':''}>NA</option><option ${e.region==='EU'?'selected':''}>EU</option><option ${e.region==='ASIA'?'selected':''}>ASIA</option><option ${e.region==='OCE'?'selected':''}>OCE</option><option ${e.region==='SA'?'selected':''}>SA</option></select></div>
        <div class="admin-field"><label class="admin-label">POINTS WINNER</label><input id="lf_pts_w" type="number" class="admin-input" value="${e.points_winner??0}" placeholder="ex: 300"></div>
        <div class="admin-field"><label class="admin-label">POINTS LOSER</label><input id="lf_pts_l" type="number" class="admin-input" value="${e.points_loser??0}" placeholder="ex: -100"></div>
        <div class="admin-field"><label class="admin-label">SEASON</label><input id="lf_season" class="admin-input" value="${e.season||'S3'}"></div>
        <div class="admin-field"><label class="admin-label">NOTES</label><input id="lf_notes" class="admin-input" value="${e.notes||''}"></div>
      </div>`;
  } else {
    const orgOptW = orgsData.map(o=>`<option value="${o.tag}" ${e.challenger===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('');
    const orgOptD = orgsData.map(o=>`<option value="${o.tag}" ${e.challenged===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('');
    const winOptW = `<option value="">— NONE —</option>${orgsData.map(o=>`<option value="${o.tag}" ${e.winner===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('')}`;
    formHtml = `
      <div class="admin-form-grid-2">
        <div class="admin-field"><label class="admin-label">DATE</label><input id="lf_date" type="date" class="admin-input" value="${e.date||''}"></div>
        <div class="admin-field"><label class="admin-label">SEASON</label><input id="lf_season" class="admin-input" value="${e.season||'S3'}"></div>
        <div class="admin-field"><label class="admin-label">CHALLENGER</label><select id="lf_challenger" class="admin-select">${orgOptW}</select></div>
        <div class="admin-field"><label class="admin-label">CHALLENGED</label><select id="lf_challenged" class="admin-select">${orgOptD}</select></div>
        <div class="admin-field"><label class="admin-label">AMOUNT</label><input id="lf_amount" class="admin-input" value="${e.amount||''}" placeholder="ex: $500, items, custom..."></div>
        <div class="admin-field"><label class="admin-label">WINNER</label><select id="lf_winner" class="admin-select">${winOptW}</select></div>
        <div class="admin-field"><label class="admin-label">STATUS</label><select id="lf_status" class="admin-select"><option value="pending" ${e.status==='pending'||!e.status?'selected':''}>PENDING</option><option value="settled" ${e.status==='settled'?'selected':''}>SETTLED</option><option value="cancelled" ${e.status==='cancelled'?'selected':''}>CANCELLED</option></select></div>
        <div class="admin-field"><label class="admin-label">NOTES</label><input id="lf_notes" class="admin-input" value="${e.notes||''}"></div>
      </div>
      <div class="admin-checkbox-row"><input type="checkbox" id="lf_paid" ${e.paid?'checked':''}><label for="lf_paid">Payment settled / Paid</label></div>`;
  }

  document.getElementById('logFormContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1rem;">
      <div class="admin-modal-icon">${isEdit?'✎':'+'}</div>
      <div class="admin-modal-title">${isEdit?'EDIT':'ADD'} ${title}</div>
    </div>
    ${formHtml}
    <div class="admin-modal-actions">
      <button class="admin-submit-btn" onclick="saveLogForm('${type}',${e.id||'null'})">SAVE</button>
      <button class="admin-cancel-btn" onclick="closeLogForm()">CANCEL</button>
    </div>`;
  document.getElementById('logFormModal').classList.add('open');
}

async function saveLogForm(type, id) {
  let body = {};
  if (type === 'war') {
    const elo1raw = g('lf_elo1'), elo2raw = g('lf_elo2');
    body = { date:g('lf_date'), org1:g('lf_org1'), org2:g('lf_org2'), score1:parseInt(g('lf_s1'))||0, score2:parseInt(g('lf_s2'))||0, winner:g('lf_winner'), wager:g('lf_wager'), region:g('lf_region'), season:g('lf_season'), notes:g('lf_notes'), elo_org1:elo1raw!==''?parseInt(elo1raw):null, elo_org2:elo2raw!==''?parseInt(elo2raw):null };
  } else if (type === 'season') {
    body = { season:g('lf_season'), date:g('lf_date'), event_name:g('lf_event')||'', org1:g('lf_org1'), org2:g('lf_org2'), score1:parseInt(g('lf_s1'))||0, score2:parseInt(g('lf_s2'))||0, winner:g('lf_winner'), region:g('lf_region'), notes:g('lf_notes'), points_winner:parseInt(g('lf_pts_w'))||0, points_loser:parseInt(g('lf_pts_l'))||0 };
  } else {
    body = { date:g('lf_date'), challenger:g('lf_challenger'), challenged:g('lf_challenged'), amount:g('lf_amount'), winner:g('lf_winner'), status:g('lf_status'), paid:document.getElementById('lf_paid').checked, season:g('lf_season'), notes:g('lf_notes') };
  }
  const path = '/logs/'+type;
  id ? await apiPut(path+'/'+id, body) : await apiPost(path, body);
  closeLogForm();
  if (type==='war')    { loadWarLogs(); loadOrgs(); }
  if (type==='season') { loadSeasonLogs(); loadOrgs(); }
  if (type==='wager')  loadWagerRecords();
}

function g(id) { const el=document.getElementById(id); return el?(el.value||''):''; }
function closeLogForm()  { document.getElementById('logFormModal').classList.remove('open'); }
function maybeCloseLogModal(e) { if (e.target===document.getElementById('logFormModal')) closeLogForm(); }

// ============================================================
// ORG FORM (Admin)
// ============================================================
function openOrgForm(existing) {
  const e = existing || {}, isEdit = !!e.id;
  const membersHtml = isEdit && e.members ? `
    <div style="margin-top:.8rem;margin-bottom:.3rem;font-size:.75rem;color:var(--yellow);letter-spacing:.1em;">ROSTER</div>
    <div id="membersList" style="margin-bottom:.4rem;">
      ${(e.members||[]).map(m=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid rgba(255,255,255,.05);">
          <span style="font-size:.85rem;">${m.name} <span class="member-role">${m.role}</span></span>
          <button class="tbl-btn del" onclick="deleteMember(${m.id},${e.id})">✕</button>
        </div>`).join('')}
    </div>
    <div class="admin-form-grid-2" style="margin-bottom:.4rem;">
      <div class="admin-field"><input id="of_mem_name" class="admin-input" placeholder="Player name"></div>
      <div class="admin-field"><select id="of_mem_role" class="admin-select"><option>Player</option><option>Leader</option><option>Sub</option><option>Coach</option></select></div>
    </div>
    <button class="admin-cancel-btn" style="margin-bottom:.8rem;width:100%;" onclick="addMember(${e.id})">+ ADD MEMBER</button>` : '';

  document.getElementById('logFormContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1rem;">
      <div class="admin-modal-icon">${isEdit?'✎':'+'}</div>
      <div class="admin-modal-title">${isEdit?'EDIT':'ADD'} ORG</div>
    </div>
    <div class="admin-form-grid-2">
      <div class="admin-field"><label class="admin-label">TAG (ex: VVS)</label><input id="of_tag" class="admin-input" value="${e.tag||''}" maxlength="5" ${isEdit?'readonly style="opacity:.5"':''}></div>
      <div class="admin-field"><label class="admin-label">NAME</label><input id="of_name" class="admin-input" value="${e.name||''}"></div>
      <div class="admin-field"><label class="admin-label">STATUS</label><select id="of_status" class="admin-select"><option value="active" ${e.status!=='inactive'?'selected':''}>ACTIVE</option><option value="inactive" ${e.status==='inactive'?'selected':''}>INACTIVE</option></select></div>
      <div class="admin-field"><label class="admin-label">REGION</label><select id="of_region" class="admin-select"><option ${!e.region||e.region==='NA'?'selected':''}>NA</option><option ${e.region==='EU'?'selected':''}>EU</option><option ${e.region==='ASIA'?'selected':''}>ASIA</option><option ${e.region==='OCE'?'selected':''}>OCE</option><option ${e.region==='SA'?'selected':''}>SA</option></select></div>
      <div class="admin-field"><label class="admin-label">FOUNDED</label><input id="of_founded" class="admin-input" value="${e.founded||'S1'}" placeholder="Season 1, S2..."></div>
      <div class="admin-field"><label class="admin-label">ICON (emoji)</label><input id="of_icon" class="admin-input" value="${e.icon||''}" placeholder="⚡ 🔥 🐉..."></div>
      <div class="admin-field" style="grid-column:span 2;"><label class="admin-label">MVP</label><input id="of_mvp" class="admin-input" value="${e.mvp||''}" placeholder="Player name"></div>
      <div class="admin-field" style="grid-column:span 2;"><label class="admin-label">LOGO URL (image link)</label><input id="of_logo" class="admin-input" value="${e.logo_url||''}" placeholder="https://..."></div>
    </div>
    ${e.logo_url ? `<div style="text-align:center;margin-bottom:.6rem;"><img src="${e.logo_url}" alt="logo" style="max-height:60px;max-width:120px;object-fit:contain;border-radius:4px;opacity:.85;"></div>` : ''}
    ${membersHtml}
    <div class="admin-modal-actions">
      <button class="admin-submit-btn" onclick="saveOrgForm(${e.id||'null'})">SAVE</button>
      <button class="admin-cancel-btn" onclick="closeLogForm()">CANCEL</button>
    </div>`;
  document.getElementById('logFormModal').classList.add('open');
}

async function saveOrgForm(id) {
  const body = { tag:g('of_tag'), name:g('of_name'), status:g('of_status'), region:g('of_region'), founded:g('of_founded'), icon:g('of_icon'), mvp:g('of_mvp'), logo_url:g('of_logo') };
  if (!body.tag || !body.name) return;
  id ? await apiPut('/orgs/'+id, body) : await apiPost('/orgs', body);
  closeLogForm();
  await loadOrgs();
}

async function addMember(orgId) {
  const name = g('of_mem_name').trim();
  if (!name) return;
  await apiPost('/orgs/'+orgId+'/members', { name, role: g('of_mem_role') });
  await loadOrgs();
  const fresh = orgsData.find(o => o.id === orgId);
  if (fresh) openOrgForm(fresh);
}

async function deleteMember(memberId, orgId) {
  await apiDelete('/org-members/'+memberId);
  await loadOrgs();
  const fresh = orgsData.find(o => o.id === orgId);
  if (fresh) openOrgForm(fresh);
}

// ============================================================
// PLAYER FORM (Admin)
// ============================================================
function openPlayerForm(existing) {
  const e = existing || {}, isEdit = !!e.id;
  document.getElementById('logFormContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1rem;">
      <div class="admin-modal-icon">${isEdit?'✎':'+'}</div>
      <div class="admin-modal-title">${isEdit?'EDIT':'ADD'} PLAYER</div>
    </div>
    <div class="admin-form-grid-2">
      <div class="admin-field"><label class="admin-label">NAME</label><input id="pf_name" class="admin-input" value="${e.name||''}"></div>
      <div class="admin-field"><label class="admin-label">ORG</label><select id="pf_org" class="admin-select"><option value="">— FREE AGENT —</option>${orgsData.map(o=>`<option value="${o.tag}" ${e.org===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('')}</select></div>
      <div class="admin-field"><label class="admin-label">ELO</label><input id="pf_elo" type="number" class="admin-input" value="${e.elo||1000}"></div>
      <div class="admin-field"><label class="admin-label">WINS</label><input id="pf_wins" type="number" min="0" class="admin-input" value="${e.wins||0}"></div>
      <div class="admin-field" style="grid-column:span 2;"><label class="admin-label">LOSSES</label><input id="pf_losses" type="number" min="0" class="admin-input" value="${e.losses||0}"></div>
    </div>
    <div class="admin-modal-actions">
      <button class="admin-submit-btn" onclick="savePlayerForm(${e.id||'null'})">SAVE</button>
      <button class="admin-cancel-btn" onclick="closeLogForm()">CANCEL</button>
    </div>`;
  document.getElementById('logFormModal').classList.add('open');
}

async function savePlayerForm(id) {
  const body = { name:g('pf_name'), org:g('pf_org'), elo:parseInt(g('pf_elo'))||1000, wins:parseInt(g('pf_wins'))||0, losses:parseInt(g('pf_losses'))||0 };
  if (!body.name) return;
  id ? await apiPut('/players/'+id, body) : await apiPost('/players', body);
  closeLogForm();
  await loadLeaderboard();
}

// ============================================================
// AWARDS
// ============================================================
async function loadAwards() {
  const loadEl=document.getElementById('awardsLoading'), emptyEl=document.getElementById('awardsEmpty'), grid=document.getElementById('awardsGrid');
  loadEl.style.display=''; emptyEl.style.display='none'; grid.innerHTML='';
  const [seasons, data] = await Promise.all([apiGet('/awards/seasons'), apiGet('/awards'+(awardsSeasonSel?'?season='+encodeURIComponent(awardsSeasonSel):''))]);
  buildAwardsSeasonTabs(Array.isArray(seasons)?seasons:[]);
  loadEl.style.display='none';
  if (!data.length) { emptyEl.style.display=''; refreshAdminButtons(); return; }
  grid.innerHTML = data.map(a => {
    const photoEl = a.photo_url
      ? `<img class="award-photo" src="${a.photo_url}" alt="${a.recipient_name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="award-photo-placeholder" style="display:none;">👤</div>`
      : `<div class="award-photo-placeholder">👤</div>`;
    const adminBtns = hasPerm('awards') ? `<div class="award-admin-btns"><button class="tbl-btn" onclick="openAwardForm(${JSON.stringify(a).replace(/"/g,'&quot;')})">✎ EDIT</button><button class="tbl-btn del" onclick="confirmDelete('award',${a.id})">✕</button></div>` : '';
    return `
      <div class="award-card">
        <div class="award-card-top">${photoEl}<div class="award-season-tag">${a.season}</div></div>
        <div class="award-card-body">
          <div class="award-title-badge">${a.award_title}</div>
          <div class="award-name">${a.recipient_name}</div>
          <div class="award-org">${a.recipient_org?'['+a.recipient_org+']':''}</div>
          ${a.award_description?`<div class="award-desc">${a.award_description}</div>`:''}
          ${adminBtns}
        </div>
      </div>`;
  }).join('');
  refreshAdminButtons();
}

function buildAwardsSeasonTabs(seasons) {
  const wrap = document.getElementById('awardsSeasonTabs');
  const all = ['ALL', ...seasons];
  wrap.innerHTML = all.map((s,i) =>
    `<button class="rtab ${(!awardsSeasonSel&&i===0)||(awardsSeasonSel===s)?'active':''}" onclick="setAwardsSeason(this,'${s==='ALL'?'':s}')">${s}</button>`
  ).join('');
}

function setAwardsSeason(btn, s) {
  awardsSeasonSel = s || null;
  document.querySelectorAll('#awardsSeasonTabs .rtab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadAwards();
}

// ============================================================
// AWARD FORM (Admin)
// ============================================================
function openAwardForm(existing) {
  const e = existing || {}, isEdit = !!e.id;
  const AWARD_PRESETS = ['Champion','MVP','Top Fragger','Best Support','Most Improved','Best Org','Fair Play'];
  const orgOpt = `<option value="">— NONE —</option>${orgsData.map(o=>`<option value="${o.tag}" ${e.recipient_org===o.tag?'selected':''}>${o.tag} — ${o.name}</option>`).join('')}`;
  document.getElementById('logFormContent').innerHTML = `
    <div class="admin-modal-header" style="margin-bottom:1rem;">
      <div class="admin-modal-icon">${isEdit?'✎':'🏆'}</div>
      <div class="admin-modal-title">${isEdit?'EDIT':'ADD'} AWARD</div>
    </div>
    <div class="admin-form-grid-2">
      <div class="admin-field"><label class="admin-label">SEASON</label><input id="af_season" class="admin-input" value="${e.season||'S3'}" placeholder="S1, S2, S3..."></div>
      <div class="admin-field"><label class="admin-label">AWARD TITLE</label>
        <select id="af_title_sel" class="admin-select" onchange="if(this.value==='custom'){document.getElementById('af_title').style.display='';document.getElementById('af_title').focus();}else{document.getElementById('af_title').style.display='none';document.getElementById('af_title').value=this.value;}">
          ${AWARD_PRESETS.map(t=>`<option value="${t}" ${e.award_title===t?'selected':''}>${t}</option>`).join('')}
          <option value="custom" ${!AWARD_PRESETS.includes(e.award_title)?'selected':''}>Custom...</option>
        </select>
        <input id="af_title" class="admin-input" style="margin-top:.4rem;${AWARD_PRESETS.includes(e.award_title)||!e.award_title?'display:none;':''}" value="${!AWARD_PRESETS.includes(e.award_title)?e.award_title||'':''}" placeholder="Custom title">
      </div>
      <div class="admin-field"><label class="admin-label">RECIPIENT NAME</label><input id="af_name" class="admin-input" value="${e.recipient_name||''}"></div>
      <div class="admin-field"><label class="admin-label">ORG</label><select id="af_org" class="admin-select">${orgOpt}</select></div>
      <div class="admin-field" style="grid-column:span 2;"><label class="admin-label">DESCRIPTION</label><textarea id="af_desc" class="admin-textarea" placeholder="What they won / why...">${e.award_description||''}</textarea></div>
      <div class="admin-field" style="grid-column:span 2;"><label class="admin-label">PHOTO URL</label><input id="af_photo" class="admin-input" value="${e.photo_url||''}" placeholder="https://cdn.discordapp.com/..."></div>
    </div>
    ${e.photo_url?`<div style="text-align:center;margin:.4rem 0 .8rem;"><img src="${e.photo_url}" style="max-height:70px;max-width:140px;object-fit:contain;border-radius:4px;opacity:.85;"></div>`:''}
    <div class="admin-modal-actions"><button class="admin-submit-btn" onclick="saveAwardForm(${e.id||'null'})">SAVE</button><button class="admin-cancel-btn" onclick="closeLogForm()">CANCEL</button></div>`;
  if (!AWARD_PRESETS.includes(e.award_title) && e.award_title) {
    document.getElementById('af_title_sel').value = 'custom';
    document.getElementById('af_title').style.display = '';
    document.getElementById('af_title').value = e.award_title;
  }
  document.getElementById('logFormModal').classList.add('open');
}

async function saveAwardForm(id) {
  const selVal = document.getElementById('af_title_sel').value;
  const title  = selVal === 'custom' ? g('af_title') : selVal;
  const body = { season:g('af_season'), recipient_name:g('af_name'), recipient_org:g('af_org'), award_title:title, award_description:g('af_desc'), photo_url:g('af_photo') };
  id ? await apiPut('/awards/'+id, body) : await apiPost('/awards', body);
  closeLogForm(); loadAwards();
}

function closeAwardForm()  { closeLogForm(); }
function maybeCloseAwardModal(e) { if (e.target===document.getElementById('awardFormModal')) closeLogForm(); }

// ============================================================
// RULES
// ============================================================
let _rulesPage = null;

async function loadRules(page) {
  const contentEl = document.getElementById(page === 'home' ? 'homeRulesContent' : 'logsRulesContent');
  const editBtn   = document.getElementById(page === 'home' ? 'editHomeRulesBtn' : 'editLogsRulesBtn');
  if (!contentEl) return;
  contentEl.innerHTML = '<div class="loading-state">LOADING...</div>';
  const data = await apiGet('/rules/' + page);
  if (data.content && data.content.trim()) {
    contentEl.className = 'rules-display';
    contentEl.textContent = data.content;
  } else {
    contentEl.className = 'rules-display empty';
    contentEl.textContent = hasPerm('all') ? 'No rules added yet. Click EDIT RULES to add.' : 'NO RULES ADDED YET.';
  }
  if (editBtn) editBtn.style.display = hasPerm('all') ? '' : 'none';
}

function openRulesEditor(page) {
  _rulesPage = page;
  const contentEl = document.getElementById(page === 'home' ? 'homeRulesContent' : 'logsRulesContent');
  const current = (contentEl && !contentEl.classList.contains('empty')) ? contentEl.textContent : '';
  document.getElementById('rulesModalTitle').textContent = page === 'home' ? 'EDIT LEAGUE RULES' : 'EDIT LOG RULES';
  document.getElementById('rulesTextarea').value = current;
  document.getElementById('rulesEditorModal').classList.add('open');
  setTimeout(() => document.getElementById('rulesTextarea').focus(), 80);
}

async function saveRules() {
  const content = document.getElementById('rulesTextarea').value;
  await apiPut('/rules/' + _rulesPage, { content });
  closeRulesEditor();
  loadRules(_rulesPage);
}

function closeRulesEditor() {
  document.getElementById('rulesEditorModal').classList.remove('open');
  _rulesPage = null;
}
function maybeCloseRulesModal(e) { if (e.target === document.getElementById('rulesEditorModal')) closeRulesEditor(); }

// ============================================================
// CONFIRM DELETE
// ============================================================
function confirmDelete(type, id) {
  _deleteCtx = { type, id };
  document.getElementById('confirmMsg').textContent = `Delete this ${type} entry permanently? This cannot be undone.`;
  document.getElementById('confirmModal').classList.add('open');
}

async function confirmDeleteYes() {
  if (!_deleteCtx) return;
  const { type, id } = _deleteCtx;
  const pathMap = { war:'/logs/war/', season:'/logs/season/', wager:'/logs/wager/', award:'/awards/', org:'/orgs/', player:'/players/', schedule:'/schedule/' };
  await apiDelete(pathMap[type]+id);
  closeConfirmModal();
  if (type==='war')      { loadWarLogs(); loadOrgs(); }
  if (type==='season')   { loadSeasonLogs(); loadOrgs(); }
  if (type==='wager')    loadWagerRecords();
  if (type==='award')    loadAwards();
  if (type==='org')      loadOrgs();
  if (type==='player')   loadLeaderboard();
  if (type==='schedule') loadSchedule();
}

function closeConfirmModal() { document.getElementById('confirmModal').classList.remove('open'); _deleteCtx=null; }

// ============================================================
// ADMIN USERS MANAGEMENT
// ============================================================
let _adminUsers = [];

async function openAdminUsers() {
  if (!hasPerm('all')) return;
  document.getElementById('adminUsersModal').classList.add('open');
  await refreshAdminUsersList();
}

function closeAdminUsers() {
  document.getElementById('adminUsersModal').classList.remove('open');
  const form = document.getElementById('adminUserForm');
  if (form) form.style.display = 'none';
}

function maybeCloseAdminUsersModal(e) {
  if (e.target === document.getElementById('adminUsersModal')) closeAdminUsers();
}

async function refreshAdminUsersList() {
  try {
    const res = await apiGet('/admin-users');
    _adminUsers = Array.isArray(res) ? res : [];
  } catch(e) { _adminUsers = []; }
  renderAdminUsersList();
}

function renderAdminUsersList() {
  const tbody = document.getElementById('adminUsersTbody');
  if (!tbody) return;
  if (!_adminUsers.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;opacity:.5">No sub-admins yet</td></tr>'; return; }
  tbody.innerHTML = _adminUsers.map(u => `
    <tr>
      <td style="font-weight:600;color:var(--yellow)">${u.username}</td>
      <td style="font-size:.75rem;color:var(--blue)">${u.perms}</td>
      <td><span style="color:${u.active?'var(--green)':'var(--red)'};">${u.active?'ACTIVE':'INACTIVE'}</span></td>
      <td>
        <button class="tbl-btn" onclick="openAdminUserEditForm(${u.id})">✎</button>
        <button class="tbl-btn del" onclick="deleteAdminUser(${u.id})">✕</button>
      </td>
    </tr>`).join('');
}

let _currentPerms = [];

function renderPermTags() {
  const container = document.getElementById('auf_perms_tags');
  if (!container) return;
  const labelMap = { all:'ALL ACCESS', logs:'LOGS', wager:'WAGER', awards:'AWARDS', brackets:'BRACKETS', orgs:'ORGS', schedule:'SCHEDULE' };
  container.innerHTML = _currentPerms.map(p =>
    `<span style="display:inline-flex;align-items:center;gap:.3rem;background:rgba(100,180,255,.12);border:1px solid rgba(100,180,255,.3);border-radius:4px;padding:.2rem .5rem;font-size:.72rem;color:${p==='all'?'var(--yellow)':'var(--blue)'};font-weight:700;">
      ${labelMap[p]||p.toUpperCase()}
      <button onclick="removePermTag('${p}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.85rem;padding:0;line-height:1;margin-left:.1rem;">✕</button>
    </span>`
  ).join('');
}

function addPermTag(perm) {
  if (!perm) return;
  if (perm === 'all') { _currentPerms = ['all']; }
  else { _currentPerms = _currentPerms.filter(p => p !== 'all'); if (!_currentPerms.includes(perm)) _currentPerms.push(perm); }
  renderPermTags();
}

function removePermTag(perm) {
  _currentPerms = _currentPerms.filter(p => p !== perm);
  renderPermTags();
}

function showAdminUserForm(id, username, perms, active) {
  const form = document.getElementById('adminUserForm');
  if (!form) return;
  document.getElementById('auf_id').value = id || '';
  document.getElementById('auf_username').value = username || '';
  document.getElementById('auf_pass').value = '';
  document.getElementById('auf_active').checked = active !== false;
  _currentPerms = (perms || 'logs').split(',').map(p => p.trim()).filter(Boolean);
  renderPermTags();
  form.style.display = '';
}

function openAdminUserAddForm() { showAdminUserForm('', '', 'logs', true); }

function openAdminUserEditForm(id) {
  const u = _adminUsers.find(x => x.id === id);
  if (!u) return;
  showAdminUserForm(u.id, u.username, u.perms, !!u.active);
}

async function saveAdminUser() {
  const id = document.getElementById('auf_id').value;
  const body = {
    username: document.getElementById('auf_username').value.trim(),
    password: document.getElementById('auf_pass').value,
    perms: _currentPerms.includes('all') ? 'all' : (_currentPerms.join(',') || 'logs'),
    active: document.getElementById('auf_active').checked ? 1 : 0,
  };
  if (!body.username) return alert('Username is required');
  if (!id && !body.password) return alert('Password is required for new users');
  try {
    const res = id ? await apiPut('/admin-users/' + id, body) : await apiPost('/admin-users', body);
    if (res && res.error) return alert('Error: ' + res.error);
    document.getElementById('adminUserForm').style.display = 'none';
    await refreshAdminUsersList();
  } catch(e) { alert('Error saving user'); }
}

async function deleteAdminUser(id) {
  if (!confirm('Delete this admin user?')) return;
  try { await apiDelete('/admin-users/' + id); await refreshAdminUsersList(); } catch(e) {}
}

// ============================================================
// INIT
// ============================================================
(async function init() {
  initCountdown();
  await verifyStoredToken();
  await Promise.all([
    loadOrgs(),
    loadLeaderboard(),
    loadBracketsFromAPI(),
    loadBracketSeasons(),
    loadSchedule(),
    loadEloInfo(),
  ]);
})();
