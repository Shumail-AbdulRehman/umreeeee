const companies = [
  { id:'northstar', name:'Northstar Labs', slug:'northstar-labs', letters:'N', color:'violet', access:'Active', setup:'Ready', activity:'18 min ago', runs:3762, blocked:250, errors:59, open:3, high:3, people:86, admins:3, pending:4, failed:0, integrations:4, groups:7, coverage:91, created:'Aug 14, 2026' },
  { id:'meridian', name:'Meridian Health', slug:'meridian-health', letters:'M', color:'blue', access:'Active', setup:'Ready', activity:'42 min ago', runs:2914, blocked:126, errors:32, open:1, high:0, people:64, admins:2, pending:3, failed:0, integrations:3, groups:5, coverage:97, created:'Sep 04, 2026' },
  { id:'atlas', name:'Atlas Financial', slug:'atlas-financial', letters:'A', color:'amber', access:'Active', setup:'Ready', activity:'1 hr ago', runs:2084, blocked:173, errors:125, open:2, high:0, people:42, admins:2, pending:1, failed:0, integrations:2, groups:3, coverage:82, created:'Sep 12, 2026' },
  { id:'studio', name:'Studio Form', slug:'studio-form', letters:'S', color:'rose', access:'Active', setup:'Setup incomplete', activity:'2 hrs ago', runs:1220, blocked:35, errors:32, open:0, high:0, people:31, admins:1, pending:2, failed:0, integrations:1, groups:2, coverage:67, created:'Oct 06, 2026' },
  { id:'solace', name:'Solace Systems', slug:'solace-systems', letters:'S', color:'green', access:'Active', setup:'Awaiting admin', activity:'No submissions', runs:0, blocked:0, errors:0, open:0, high:0, people:0, admins:0, pending:1, failed:0, integrations:0, groups:0, coverage:null, created:'Nov 22, 2026' },
  { id:'cinder', name:'Cinder Works', slug:'cinder-works', letters:'C', color:'rose', access:'Suspended', setup:'Ready', activity:'12 days ago', runs:0, blocked:0, errors:0, open:0, high:0, people:24, admins:1, pending:0, failed:0, integrations:1, groups:2, coverage:null, history:380, created:'Oct 10, 2026' },
  { id:'field', name:'Fieldnote', slug:'fieldnote', letters:'F', color:'green', access:'Active', setup:'Ready', activity:'3 hrs ago', runs:936, blocked:71, errors:11, open:1, high:0, people:25, admins:1, pending:1, failed:0, integrations:1, groups:3, coverage:96, created:'Oct 12, 2026' },
  { id:'orbit', name:'Orbit Research', slug:'orbit-research', letters:'O', color:'blue', access:'Active', setup:'Ready', activity:'8 hrs ago', runs:694, blocked:58, errors:33, open:0, high:0, people:18, admins:2, pending:0, failed:0, integrations:2, groups:2, coverage:88, created:'Oct 18, 2026' },
  { id:'vector', name:'Vector House', slug:'vector-house', letters:'V', color:'violet', access:'Active', setup:'Ready', activity:'Yesterday', runs:523, blocked:26, errors:6, open:0, high:0, people:12, admins:1, pending:0, failed:0, integrations:1, groups:2, coverage:100, created:'Nov 01, 2026' },
  { id:'juniper', name:'Juniper Studio', slug:'juniper-studio', letters:'J', color:'amber', access:'Active', setup:'Setup incomplete', activity:'No submissions', runs:0, blocked:0, errors:0, open:0, high:0, people:5, admins:1, pending:2, failed:1, integrations:0, groups:1, coverage:null, created:'Nov 20, 2026' },
  { id:'evergreen', name:'Evergreen Data', slug:'evergreen-data', letters:'E', color:'green', access:'Active', setup:'Ready', activity:'2 days ago', runs:351, blocked:10, errors:4, open:0, high:0, people:11, admins:1, pending:0, failed:0, integrations:1, groups:1, coverage:94, created:'Nov 08, 2026' },
  { id:'lightwell', name:'Lightwell Design', slug:'lightwell-design', letters:'L', color:'blue', access:'Active', setup:'Awaiting admin', activity:'No submissions', runs:0, blocked:0, errors:0, open:0, high:0, people:0, admins:0, pending:1, failed:0, integrations:0, groups:0, coverage:null, created:'Nov 24, 2026' },
];
const audit = [
  { company:'northstar', event:'Policy updated', actor:'Organization admin', date:'Nov 24, 2026 · 09:46', note:'Guardrail policy assignments changed', id:'REQ-1042' },
  { company:'atlas', event:'Integration updated', actor:'Organization admin', date:'Nov 24, 2026 · 08:22', note:'Provider integration configuration updated', id:'REQ-1038' },
  { company:'meridian', event:'Violation resolved', actor:'Organization admin', date:'Nov 23, 2026 · 15:31', note:'Policy violation marked resolved', id:'REQ-1029' },
  { company:'juniper', event:'Admin verified', actor:'Organization admin', date:'Nov 22, 2026 · 10:17', note:'First administrator verified their account', id:'REQ-1001' },
  { company:'cinder', event:'Company suspended', actor:'Platform owner', date:'Nov 12, 2026 · 14:10', note:'Temporary access pause requested by the company', id:'REQ-0817' },
];
const main = document.querySelector('#main');
const dialog = document.querySelector('#access-dialog');
const announcement = document.querySelector('#announcement');
const selectState = { days:7, query:'', access:'', setup:'', sort:'runs', page:1, auditCompany:'', auditType:'' };
const weekWeights = [11, 15, 13, 17, 12, 15, 17];
const priorWeights = [12, 9, 12, 10, 14, 13, 14, 16];
const outcome = [
  { name:'Allowed', color:'allowed' },
  { name:'Blocked', color:'blocked' },
  { name:'Other outcomes', color:'other' },
];
let currentRoute = '';
let statusTarget;
let notice = '';
const nf = new Intl.NumberFormat('en-US');

function icon(name) { return icons[name] || ''; }
function fmt(value) { return nf.format(value); }
function escapeText(value) {
  const span = document.createElement('span');
  span.textContent = value;
  return span.innerHTML;
}
function split(total, weights) {
  let allocated = 0;
  const sum = weights.reduce((a,b) => a + b, 0);
  return weights.map((weight, index) => {
    const value = index === weights.length - 1 ? total - allocated : Math.floor(total * weight / sum);
    allocated += value;
    return value;
  });
}
function history(company, days) {
  const totals = [company.runs - company.blocked - company.errors, company.blocked, company.errors];
  const recent = totals.map((total, index) => split(total, index ? [9, 11, 19, 13, 16, 15, 17] : weekWeights));
  if (days === 7) return weekWeights.map((_, index) => recent.map(row => row[index]));
  const prior = totals.map((total, index) => split(company.history ? (index ? 0 : company.history) : Math.round(total * 2.6), priorWeights));
  return [...priorWeights.map((_, index) => prior.map(row => row[index])), ...[recent.map(row => row.slice(0, 3).reduce((a,b)=>a+b)), recent.map(row => row.slice(3).reduce((a,b)=>a+b))]];
}
function total(row) { return row.reduce((a,b)=>a+b, 0); }
function companyRuns(company) { return total(history(company, selectState.days).map(total)); }
function reportRows(items) {
  const series = items.map(item => history(item, selectState.days));
  return series[0].map((row, index) => row.map((_,kind) => series.reduce((sum, value) => sum + value[index][kind], 0)));
}
function findCompany(id) { return companies.find(company => company.id === id); }
function badge(value) {
  const tone = { Active:'green', Ready:'green', Suspended:'rose', 'Setup incomplete':'amber', 'Awaiting admin':'amber' }[value] || 'neutral';
  return `<span class="badge ${tone}"><i></i>${value}</span>`;
}
function mark(company) { return `<span class="company-mark ${company.color}" aria-hidden="true">${company.letters}</span>`; }
function dateControl() {
  return `<div class="period-control"><label class="sr-only" for="period">Reporting period</label>${icon('calendar')}<select id="period"><option value="7" ${selectState.days===7?'selected':''}>Last 7 days</option><option value="30" ${selectState.days===30?'selected':''}>Last 30 days</option></select>${icon('chevron')}</div>`;
}
function heading(title, summary, controls = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${summary}</p></div>${controls}</div>`;
}
function dateWindow() { return selectState.days === 7 ? 'Nov 18–24, 2026' : 'Oct 26–Nov 24, 2026'; }
function chart(items, detail = false) {
  const rows = reportRows(items);
  const values = rows.map(total);
  const peak = Math.max(...values);
  const step = peak > 3000 ? 2000 : peak > 900 ? 500 : peak > 150 ? 200 : peak > 20 ? 20 : 4;
  const max = Math.max(step * 4, Math.ceil(peak / (step * 4)) * step * 4);
  const axis = [max,max*.75,max*.5,max*.25,0];
  const labels = selectState.days === 7 ? ['Nov 18','Nov 19','Nov 20','Nov 21','Nov 22','Nov 23','Nov 24'] : ['Oct 26','Oct 29','Nov 01','Nov 04','Nov 07','Nov 10','Nov 13','Nov 16','Nov 18','Nov 21'];
  return `<section class="panel chart-panel" aria-labelledby="activity-title">
    <div class="panel-head"><div><h2 id="activity-title">${detail?'Company activity':'Workspace activity'}</h2><p>${dateWindow()} · UTC</p></div><span class="chart-icon">${icon('chart')}</span></div>
    <div class="chart-summary"><strong>${fmt(total(values))}</strong><span>prompt submissions</span></div>
    ${peak ? `<div class="chart" aria-hidden="true">
      <div class="axis">${axis.map(value => `<span>${value>=1000 ? (value/1000)+'k' : value}</span>`).join('')}</div>
      <div class="plot">
        <div class="grid-lines">${axis.map(() => '<i></i>').join('')}</div>
        <div class="bars" style="--columns:${rows.length}">${rows.map((row,index) => `<div class="bar-slot" title="${labels[index]} · ${fmt(values[index])} submissions"><div class="bar-stack">${row.map((value,i) => `<span class="${outcome[i].color}" style="height:${value/max*100}%"></span>`).join('')}</div></div>`).join('')}</div>
      </div>
      <div class="axis-dates" style="--columns:${rows.length}">${labels.map((label,index) => `<span class="${rows.length===10 && index%2?'alternate':''}">${label}</span>`).join('')}</div>
    </div>` : '<div class="chart-empty">No workspace submissions in this period.</div>'}
    <div class="chart-footer"><div class="legend">${outcome.map(item => `<span><i class="${item.color}"></i>${item.name}</span>`).join('')}</div>
    <details class="chart-data"><summary>Chart data</summary><table class="data-table chart-table"><thead><tr><th scope="col">UTC bucket starts</th>${outcome.map(item=>`<th scope="col">${item.name}</th>`).join('')}</tr></thead><tbody>${rows.map((row,i)=>`<tr><th scope="row">${labels[i]}</th>${row.map(value=>`<td>${fmt(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></details></div>
  </section>`;
}
function attention() {
  return [
    { company:'northstar', tone:'rose', icon:'shield', time:'Today', title:'3 high-severity violations', description:'Open and awaiting review.' },
    { company:'atlas', tone:'amber', icon:'plug', time:'Last 7 days', title:'Repeated provider errors', description:'125 failed workspace submissions.' },
    { company:'solace', tone:'violet', icon:'mail', time:'2 days ago', title:'First admin unverified', description:'Company registered Nov 22.' },
    { company:'juniper', tone:'blue', icon:'plug', time:'4 days ago', title:'No active integration', description:'Workspace setup is incomplete.' },
  ];
}
function attentionPanel() {
  const issues = attention();
  return `<section class="panel attention-panel" aria-labelledby="attention-title">
    <div class="panel-head"><div><h2 id="attention-title">Needs attention</h2><p>Company issues to review</p></div><span class="count-chip">${issues.length} open</span></div>
    <ul class="issue-list">${issues.map(issue => `<li><a href="#company/${issue.company}" class="issue"><span class="issue-icon ${issue.tone}">${icon(issue.icon)}</span><span class="issue-body"><strong>${issue.title}</strong><span>${findCompany(issue.company).name} · ${issue.time}</span><small>${issue.description}</small></span>${icon('right')}</a></li>`).join('')}</ul>
  </section>`;
}
function metrics() {
  const active = companies.filter(company => companyRuns(company) > 0).length;
  const ready = companies.filter(company => company.setup !== 'Ready').length;
  const paused = companies.filter(company => company.access === 'Suspended').length;
  const cells = [
    ['building', 'Total companies', companies.length, 'All registered companies', 'violet'],
    ['pulse', 'Companies using Averiq', active, `Submitted in the last ${selectState.days} days`, 'green'],
    ['clock', 'Onboarding', ready, 'Verification or setup pending', 'amber'],
    ['pause', 'Suspended', paused, 'Workspace access paused', 'rose'],
  ];
  return `<section class="metric-strip" aria-label="Company summary">${cells.map(([symbol,label,value,context,tone]) => `<div class="metric"><span class="metric-icon ${tone}">${icon(symbol)}</span><div><h2>${label}</h2><strong>${fmt(value)}</strong><p>${context}</p></div></div>`).join('')}</section>`;
}
function trend(company) {
  const values = history(company,selectState.days).map(total);
  const peak = Math.max(...values);
  if (!peak) return '<span class="muted">—</span>';
  return `<span class="spark" aria-hidden="true">${values.map(value => `<i style="height:${Math.max(12, value/peak*100)}%"></i>`).join('')}</span>`;
}
function companyTable(items) {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Company results"><table class="data-table company-table">
    <thead><tr><th scope="col">Company</th><th scope="col">Access</th><th scope="col">Onboarding</th><th scope="col" class="usage-column">Workspace runs</th><th scope="col">Last submission</th><th scope="col" class="align-right">Open violations</th></tr></thead>
    <tbody>${items.map(company => `<tr><th scope="row"><a class="company-link" href="#company/${company.id}">${mark(company)}<span><strong>${company.name}</strong><small>${company.slug}</small></span></a></th><td>${badge(company.access)}</td><td><span class="setup-label ${company.setup==='Ready'?'complete':''}">${icon(company.setup==='Ready'?'checkCircle':'clock')}${company.setup}</span></td><td><div class="usage-cell"><strong>${fmt(companyRuns(company))}</strong>${trend(company)}</div></td><td>${company.activity}</td><td class="align-right"><span class="${company.open?'violation-count':'muted'}">${company.open}</span></td></tr>`).join('')}</tbody>
  </table></div>`;
}
function overview() {
  return `${heading('Platform overview','Monitor company adoption, setup and activity across Averiq.', dateControl())}
    ${metrics()}
    <div class="dashboard-grid">${chart(companies)}${attentionPanel()}</div>
    <section class="panel directory-panel" aria-labelledby="company-activity-title">
      <div class="panel-head"><div><h2 id="company-activity-title">Company activity</h2><p>Most workspace submissions in the selected period</p></div><a class="button" href="#companies">View all companies${icon('arrow')}</a></div>
      ${companyTable([...companies].sort((a,b)=>companyRuns(b)-companyRuns(a)).slice(0,4))}
    </section>`;
}
function filterOptions(values, selected) {
  return values.map(([value,label]) => `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}
function directory() {
  return `${heading('Companies','Find companies and compare onboarding, access and usage.',dateControl())}
  <section class="panel directory-panel" aria-label="Companies directory">
    <div class="toolbar">
      <label class="search-field">${icon('search')}<span class="sr-only">Search companies</span><input type="search" id="company-query" placeholder="Search name or slug" autocomplete="off"></label>
      <label class="filter-field"><span class="sr-only">Access status</span><select id="access-filter">${filterOptions([['','All access statuses'],['Active','Active'],['Suspended','Suspended']],selectState.access)}</select></label>
      <label class="filter-field"><span class="sr-only">Onboarding status</span><select id="setup-filter">${filterOptions([['','All onboarding states'],['Ready','Ready'],['Setup incomplete','Setup incomplete'],['Awaiting admin','Awaiting admin']],selectState.setup)}</select></label>
      <label class="filter-field sort-field"><span class="sr-only">Sort companies</span><select id="sort-filter">${filterOptions([['runs','Most submissions'],['name','Company name'],['violations','Most open violations']],selectState.sort)}</select></label>
    </div><div id="company-results"></div>
  </section>`;
}
function updateDirectory(speak = false) {
  const query = selectState.query.trim().toLowerCase();
  const results = companies.filter(item => (!query || (item.name+' '+item.slug).toLowerCase().includes(query)) &&
    (!selectState.access || selectState.access === item.access) && (!selectState.setup || selectState.setup === item.setup));
  const sorters = { runs:(a,b)=>companyRuns(b)-companyRuns(a), name:(a,b)=>a.name.localeCompare(b.name), violations:(a,b)=>b.open-a.open };
  results.sort(sorters[selectState.sort]);
  const size = 8;
  const page = Math.min(selectState.page,Math.max(1,Math.ceil(results.length/size)));
  selectState.page = page;
  const start = (page-1)*size;
  const table = results.length ? companyTable(results.slice(start,start+size)) : '<div class="empty"><h2>No companies found</h2><p>Try a different name or clear the filters.</p><button class="button" data-page="reset">Clear filters</button></div>';
  document.querySelector('#company-results').innerHTML = table + `<footer class="pagination"><span>${results.length?fmt(start+1)+'–'+fmt(Math.min(start+size,results.length))+' of '+fmt(results.length)+' companies':'0 companies'}</span><div><button class="button" data-page="previous" ${page===1?'disabled':''}>Previous</button><button class="button" data-page="next" ${start+size>=results.length?'disabled':''}>Next</button></div></footer>`;
  if (speak) announcement.textContent = results.length + ' companies found.';
}
function auditTable(records, companyDetail = false) {
  if (!records.length) return '<div class="empty"><h2>No matching events</h2><p>Try a different filter or check back after a company change.</p></div>';
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="Audit events"><table class="data-table audit-table"><thead><tr><th scope="col">Event</th>${companyDetail?'':'<th scope="col">Company</th>'}<th scope="col">Actor</th><th scope="col">Recorded · UTC</th><th scope="col">Request ID</th></tr></thead><tbody>
    ${records.map(item => `<tr><th scope="row"><strong>${item.event}</strong><small>${escapeText(item.note)}</small></th>${companyDetail?'':`<td><a href="#company/${item.company}">${findCompany(item.company).name}</a></td>`}<td>${item.actor}</td><td>${item.date}</td><td class="request-id">${item.id}</td></tr>`).join('')}</tbody></table></div>`;
}
function auditScreen() {
  const types = [...new Set(audit.map(item=>item.event))].sort();
  return `${heading('Audit log','Review company milestones and platform access changes.')}
  <section class="panel directory-panel" aria-label="Audit events">
    <div class="toolbar">
      <label class="filter-field"><span class="sr-only">Company</span><select id="audit-company">${filterOptions([['','All companies'],...companies.map(company=>[company.id,company.name])],selectState.auditCompany)}</select></label>
      <label class="filter-field"><span class="sr-only">Event type</span><select id="audit-type">${filterOptions([['','All event types'],...types.map(type=>[type,type])],selectState.auditType)}</select></label>
    </div><div id="audit-results"></div>
  </section>`;
}
function updateAudit() {
  const rows = audit.filter(row => (!selectState.auditCompany || row.company===selectState.auditCompany) && (!selectState.auditType || row.event===selectState.auditType));
  document.querySelector('#audit-results').innerHTML = auditTable(rows);
}
function detail(company) {
  const active = company.access === 'Active';
  const issueList = attention().filter(issue=>issue.company===company.id);
  const totals = reportRows([company]);
  const blocks = totals.reduce((sum,row)=>sum+row[1],0);
  const errors = totals.reduce((sum,row)=>sum+row[2],0);
  return `<a href="#companies" class="back-link">${icon('back')}All companies</a>
    <div class="page-heading company-heading"><div class="company-heading-start">${mark(company)}<div><h1>${company.name}</h1><p>${company.slug} · Joined ${company.created}</p></div></div>
      <div class="heading-actions">${badge(company.access)}<button class="button ${active?'danger':'primary'}" type="button" data-company-action="${company.id}">${icon(active?'pause':'checkCircle')}${active?'Suspend company':'Reactivate company'}</button></div></div>
    ${notice ? `<p class="notice">${notice}</p>` : ''}
    ${issueList.map(issue => `<div class="issue-banner"><span class="issue-icon ${issue.tone}">${icon(issue.icon)}</span><div><strong>${issue.title}</strong><p>${issue.description}</p></div></div>`).join('')}
    <div class="section-row"><div><h2>Company overview</h2><p>Current setup and recorded workspace outcomes</p></div>${dateControl()}</div>
    <section class="metric-strip detail-metrics" aria-label="Company metrics">
      ${[['users','Active accounts',company.people,`${company.admins} verified admins`,'violet'],['pulse','Workspace runs',companyRuns(company),`Last ${selectState.days} days`,'green'],['shield','Blocked runs',blocks,`${fmt(errors)} other outcomes`,'amber'],['warning','Open violations',company.open,`${company.high} high severity`,'rose']].map(([symbol,label,value,caption,tone])=>`<div class="metric"><span class="metric-icon ${tone}">${icon(symbol)}</span><div><h3>${label}</h3><strong>${fmt(value)}</strong><p>${caption}</p></div></div>`).join('')}
    </section>
    <div class="dashboard-grid">${chart([company],true)}
      <section class="panel setup-panel" aria-labelledby="setup-title"><div class="panel-head"><div><h2 id="setup-title">Workspace setup</h2><p>Onboarding and policy readiness</p></div>${badge(company.setup)}</div>
        <dl class="setup-list"><div><dt>Verified administrators</dt><dd>${company.admins}</dd></div><div><dt>Pending invitations</dt><dd>${company.pending}${company.failed ? ` <small>· ${company.failed} failed delivery</small>` : ''}</dd></div><div><dt>Active integrations</dt><dd>${company.integrations}</dd></div><div><dt>Active groups</dt><dd>${company.groups}</dd></div></dl>
        <div class="coverage"><div><strong>Evaluation coverage</strong><span>${company.coverage===null?'Unavailable':company.coverage+'%'}</span></div>${company.coverage===null ? '<p>Coverage appears when workspace runs are evaluated.</p>' : `<progress max="100" value="${company.coverage}" aria-label="Workspace runs evaluated"></progress><p>Recorded runs with completed policy checks.</p>`}</div>
      </section>
    </div>
    <section class="panel directory-panel" aria-labelledby="company-history-title"><div class="panel-head"><div><h2 id="company-history-title">Company history</h2><p>Workspace milestones and platform actions</p></div><a class="button" href="#audit/${company.id}">View audit log${icon('arrow')}</a></div>${auditTable(audit.filter(item=>item.company===company.id),true)}</section>`;
}
function openAccess(company) {
  statusTarget = company;
  const active = company.access === 'Active';
  dialog.innerHTML = `<form id="access-form">
    <div class="dialog-header"><span class="issue-icon ${active?'rose':'green'}">${icon(active?'pause':'checkCircle')}</span><button type="button" class="icon-button" data-close-dialog aria-label="Close">${icon('x')}</button></div>
    <h2 id="access-title">${active?'Suspend':'Reactivate'} ${company.name}?</h2>
    <p>${active?'Members lose access to the workspace while the company is suspended.':'Members regain access to the company workspace.'} This change is recorded in the audit log.</p>
    <label class="reason-label" for="reason">Reason</label><textarea id="reason" name="reason" placeholder="Why are you changing access?" maxlength="180" required></textarea>
    <p class="dialog-caption">This preview resets when you reload.</p>
    <div class="dialog-actions"><button type="button" class="button" data-close-dialog autofocus>Cancel</button><button class="button ${active?'confirm-danger':'primary'}" type="submit">${active?'Suspend company':'Reactivate company'}</button></div>
  </form>`;
  dialog.showModal();
}
function setMenu(open) {
  const menu = document.querySelector('#menu-toggle');
  menu.setAttribute('aria-expanded',String(open));
  menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  document.querySelector('.shell').classList.toggle('menu-open',open);
}
function render(moveFocus = false) {
  const route = location.hash.slice(1) || 'overview';
  const changed = route !== currentRoute;
  if (changed) notice = '';
  currentRoute = route;
  const [view,id] = route.split('/');
  const company = view==='company' ? findCompany(id) : null;
  const active = company ? 'companies' : ['companies','audit'].includes(view) ? view : 'overview';
  if (changed && view==='audit') selectState.auditCompany = findCompany(id) ? id : '';
  const label = { overview:'Overview', companies:'Companies', audit:'Audit log' }[active];
  const current = (name) => `<span aria-current="page">${name}</span>`;
  document.querySelector('#crumb').innerHTML = `<span>Platform</span>${icon('right')}${company?`<a href="#companies">Companies</a>${icon('right')}${current(company.name)}`:current(label)}`;
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.dataset.nav===active) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  main.innerHTML = company ? detail(company) : active==='companies' ? directory() : active==='audit' ? auditScreen() : overview();
  if (active==='companies' && !company) {
    document.querySelector('#company-query').value = selectState.query;
    updateDirectory();
  }
  if (active==='audit') updateAudit();
  if (moveFocus) {
    setMenu(false);
    window.scrollTo(0,0);
    main.focus({preventScroll:true});
  }
}
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML=icon(node.dataset.icon); });
document.querySelector('.skip-link').addEventListener('click',event=>{ event.preventDefault(); main.focus(); });
document.querySelector('#menu-toggle').addEventListener('click',event=>setMenu(event.currentTarget.getAttribute('aria-expanded')!=='true'));
window.addEventListener('hashchange',()=>render(true));
main.addEventListener('input',event=>{
  if (event.target.id!=='company-query') return;
  selectState.query=event.target.value;
  selectState.page=1;
  updateDirectory(true);
});
main.addEventListener('change',event=>{
  const id=event.target.id;
  if (id==='period') {
    selectState.days=Number(event.target.value);
    selectState.page=1;
    render();
    document.querySelector('#period').focus();
  }
  const filters={ 'access-filter':'access','setup-filter':'setup','sort-filter':'sort' };
  if (filters[id]) {
    selectState[filters[id]]=event.target.value;
    selectState.page=1;
    updateDirectory(true);
  }
  const auditFilters={ 'audit-company':'auditCompany','audit-type':'auditType' };
  if (auditFilters[id]) {
    selectState[auditFilters[id]]=event.target.value;
    updateAudit();
  }
});
main.addEventListener('click',event=>{
  const action = event.target.closest('[data-company-action]');
  if (action) openAccess(findCompany(action.dataset.companyAction));
  const control = event.target.closest('[data-page]');
  if (!control) return;
  if (control.dataset.page==='reset') {
    Object.assign(selectState,{query:'',access:'',setup:'',page:1});
    render();
    document.querySelector('#company-query').focus();
  } else {
    selectState.page += control.dataset.page==='next'?1:-1;
    updateDirectory(true);
    document.querySelector('#company-results .table-wrap')?.focus();
  }
});
dialog.addEventListener('click',event=>{ if (event.target.closest('[data-close-dialog]')) dialog.close(); });
dialog.addEventListener('submit',event=>{
  event.preventDefault();
  const reason = event.target.elements.reason;
  if (!reason.value.trim()) {
    reason.setCustomValidity('Enter a reason for the access change.');
    reason.reportValidity();
    return;
  }
  const suspended = statusTarget.access==='Active';
  statusTarget.access = suspended?'Suspended':'Active';
  const label = suspended?'suspended':'reactivated';
  audit.unshift({ company:statusTarget.id, event:'Company '+label, actor:'Platform owner', date:'Just now · Preview', note:reason.value.trim(), id:'PREVIEW-'+(audit.length+1) });
  notice = statusTarget.name+' '+label+'. The change was added to the audit log.';
  announcement.textContent = notice;
  dialog.close();
  render();
  main.querySelector('[data-company-action]').focus();
});
dialog.addEventListener('input',event=>{ if (event.target.id==='reason') event.target.setCustomValidity(''); });
render();
