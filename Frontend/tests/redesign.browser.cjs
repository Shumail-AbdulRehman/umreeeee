// Presentation regression: synthetic fixtures only; every API request is intercepted.
const { chromium } = require('playwright')
const AxeBuilder = require('@axe-core/playwright').default
const assert = require('node:assert/strict')
const fs = require('node:fs')
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5187'
const id = (n) => String(n).padStart(24, '0')
const stamp = '2026-10-11T09:30:00Z'
const people = ['Ada Morgan', 'Omar Khan', 'Maya Chen'].map((name, i) => ({ id:id(i+1), first_name:name.split(' ')[0],last_name:name.split(' ')[1],email:`person${i}@example.test`,role:i ? 'user':'org_admin',department:'Engineering',group_ids:[id(9)],account_status:i===2?'invited':'active',is_active:true,version:1 }))
const integrations = [{id:id(8),provider:'openai',account_name:'Research workspace',status:'active',models:['gpt-4.1-mini','gpt-4.1'],model_prices:[],version:1,has_api_key:true,masked_api_key:'••••••1234',policy_count:2}]
const groups = [{_id:id(9),name:'Product & engineering',description:'Research and product delivery',status:'active',member_count:3,policy_count:2,updated_at:stamp,version:1}]
const runs = people.map((p,i)=>({id:id(20+i),user_name:`${p.first_name} ${p.last_name}`,user_email:p.email,status:i===1?'blocked_input':'allowed',provider:'openai',model:'gpt-4.1-mini',created_at:stamp,total_tokens:540,estimated_cost_usd:0.002,prompt:'Summarize the project notes.',response_text:'The project is ready for review.',input_evaluation:{rule_results:[],errors:[]}}))
const models = [{provider:'openai',model:'gpt-4.1-mini',runs:24,known_tokens:18400,estimated_cost_usd:0.09,unknown_usage_runs:1,unknown_cost_runs:1},{provider:'openai',model:'gpt-4.1',runs:8,known_tokens:7000,estimated_cost_usd:0.13,unknown_usage_runs:0,unknown_cost_runs:0}]
const summary = {total_submissions:32,allowed:24,blocked:6,errors:{provider_error:2},processing:0,violation_events:6,violation_rate:0.2,violation_rate_denominator:30,known_prompt_tokens:15000,known_completion_tokens:10400,known_tokens:25400,estimated_cost_usd:0.22,unknown_usage_runs:1,unknown_cost_runs:1,latency:Object.fromEntries([['provider_latency_ms',650],['enforcement_latency_ms',120],['total_latency_ms',800]].map(([key,n])=>[key,{count:32,p50:n,p95:n*1.8,p99:n*2.1}]))}
const dashboard = {summary,models,administration:{users:3,active_users:2,groups:1,integrations:1,policies:2},series:Array.from({length:7},(_,i)=>['allowed','blocked_input'].map((status,j)=>({date:`2026-10-${String(i+5).padStart(2,'0')}`,status,count:j?(i%3):i+1}))).flat(),violation_categories:[{name:'dlp',count:4},{name:'guardrail',count:2}],violation_types:[{name:'email',count:3},{name:'direct_injection',count:2}],users_at_risk:[{name:'Omar Khan',count:4}],spend_by_user:[{name:'Ada Morgan',cost_usd:0.14,runs:18},{name:'Maya Chen',cost_usd:0.08,runs:14}],cost_series:Array.from({length:7},(_,i)=>({date:`2026-10-${String(i+5).padStart(2,'0')}`,cost_usd:0.02+i*0.003})),recent_runs:runs}
const catalogs = ['dlp','guardrail'].map(category=>({_id:`catalog-${category}`,category,status:'active',version:1,scope:{group_ids:[],integration_ids:[]},entry_count:3,entries:['Email addresses','Credentials','Personal identifiers'].map((title,i)=>({id:`${category}-${i}`,title,categories:['Security']}))}))
const violation = {id:id(30),policy_name:'Sensitive information',category:'dlp',severity:'high',action:'block',stage:'input',resolution_status:'open',created_at:stamp,version:1,policy_version:1,run_id:runs[1].id,findings:[{type:'email',field:'prompt'}]}
const score = {compliance_score:0.8,attack_success_rate:0.2,evaluable_fraction:1,passed_count:4,unsafe_count:1,evaluable_count:5,inconclusive_count:0,error_count:0,cancelled_count:0,threshold_verdict:'passed',control_results:{allowed:5,blocked:0,inconclusive:0,error:0},categories:{direct_injection:{pass:3,fail:1},pii_extraction:{pass:1,fail:0}}}
const test = {id:id(40),name:'Workspace policy evaluation',model:'gpt-4.1-mini',integration_id:id(8),mode:'protected',status:'completed',version:1,created_at:stamp,launched_at:stamp,num_attacks:5,control_count:5,seed:1,catalog_version:'1',evaluator_version:'1',config_snapshot:{integration_name:'Research workspace'},progress:{terminal_jobs:10,total_jobs:10,queued:0,running:0,retry_wait:0,pending:0},score}
const routes = ['insights','integrations','inventory','policies','dlp-policy','guardrail-policy','prompt-studio','violations','users','user-insights','activity-log','catalog','latency','spend','settings','red-team']
let activeBrowser
;(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']})
 activeBrowser=browser
 const errors=[],violations=[],unknown=[]
 let role='org_admin', mode='populated'
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 const page=await context.newPage()
 page.setDefaultTimeout(12000)
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>localStorage.setItem('centurion.auth.token','synthetic-only'))
 const list=(items)=>({items:mode==='empty'?[]:items,total:mode==='empty'?0:items.length,page:1,page_size:20})
 await page.route(`${base}/api/**`,async route=>{
  const p=new URL(route.request().url()).pathname
  const respond=(json,status=200)=>route.fulfill({json,status})
  if(p==='/api/auth/me') return respond({...people[0],role,company:{id:id(50),name:'Northstar Labs'}})
  if(p==='/api/notifications') return respond(list([]))
  if(p==='/api/dashboard') return mode==='error'?respond({detail:{message:'Unable to load recorded activity'}},503):respond(mode==='empty'?{summary:{},series:[],models:[]}:dashboard)
  if(p==='/api/analytics/summary') return respond(mode==='empty'?{}:summary)
  if(p==='/api/analytics/series') return respond(list(dashboard.series))
  if(p==='/api/analytics/models') return respond(list(models))
  if(p==='/api/users') return respond(list(people))
  if(p==='/api/groups') return respond(list(groups))
  if(p==='/api/integrations') return respond(list(integrations))
  if(p==='/api/policies') return respond(list(catalogs))
  if(p==='/api/policy-sets') return respond(list([]))
  if(p==='/api/settings') return respond({settings:{name:'Northstar Labs',slug:'northstar-labs',version:1,content_retention_days:7,require_active_policy:true}})
  if(p==='/api/audit') return respond(list([{_id:id(60),action:'group.created',resource_type:'group',resource_id:id(9),request_id:'req-example-001',created_at:stamp}]))
  if(p==='/api/platform/organizations') return respond(list([{_id:id(50),name:'Northstar Labs',slug:'northstar-labs',status:'active',version:1}]))
  if(p==='/api/prompt-workspace/context') return respond({integrations,groups:groups.map(g=>({id:g._id,name:g.name})),require_active_policy:true,input_policy_coverage:{[id(8)]:true},enforcement_ready:true})
  if(p==='/api/prompt-workspace/conversations') return respond(list([]))
  if(p==='/api/prompt-workspace/runs') return respond(list(runs))
  if(p.startsWith('/api/prompt-workspace/runs/')) return respond({run:runs[0]})
  if(p==='/api/violations') return respond(list([violation]))
  if(p.startsWith('/api/violations/')) return respond({violation})
  if(p==='/api/red-team/capabilities') return respond({broker_transport_reachable:true,worker_observed:true,requests_per_minute:6})
  if(p==='/api/red-team/tests') return respond(list([test]))
  if(p===`/api/red-team/tests/${test.id}`) return respond({test})
  if(p===`/api/red-team/tests/${test.id}/results`) return respond(list([]))
  unknown.push(p); return route.abort()
 })
 const settled=async()=>{
  await page.waitForFunction(()=>!document.querySelector('.page-loading-overlay, .loading-surface'))
  await page.evaluate(()=>document.fonts.ready)
  await page.waitForTimeout(150)
 }
 const noOverflow=async(label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label}: horizontal page overflow`)
 const audit=async(label)=>{
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()
  for(const v of result.violations) violations.push({page:label,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})
  fs.writeFileSync('/tmp/sentinel-redesign-a11y.json',JSON.stringify(violations,null,2))
 }
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:width===390?844:1000})
  for(const route of routes){
   await page.goto(`${base}/#${route}`); await settled(); await noOverflow(`${width}/${route}`)
   if(['users','inventory','red-team'].includes(route)) {
    const search=page.locator('.admin-toolbar > .search-field').first()
    assert.equal(await search.evaluate(el=>el.getBoundingClientRect().width>=180),true,`${route}/${width}: usable search width`)
    assert.equal(await search.evaluate(el=>{
     const a=el.getBoundingClientRect()
     return Array.from(el.parentElement.children).filter(n=>n!==el).every(n=>{const b=n.getBoundingClientRect();return a.right<=b.left+1 || a.left>=b.right-1 || a.bottom<=b.top+1 || a.top>=b.bottom-1})
    }),true,`${route}/${width}: search must not overlap adjacent filters`)
   }
   if(width!==768) await audit(`${width}/${route}`)
   if(['insights','prompt-studio','users','dlp-policy'].includes(route)&&width!==768) await page.screenshot({path:`/tmp/sentinel-redesign-${route}-${width}.png`,fullPage:true})
  }
 }
 await page.setViewportSize({width:390,height:844})
 await page.getByRole('button',{name:'Open navigation',exact:true}).click()
 await page.getByRole('dialog').waitFor();await audit('mobile/navigation-dialog')
 await page.getByRole('dialog').getByRole('button',{name:'Users',exact:true}).click()
 await page.getByRole('dialog').waitFor({state:'hidden'});await settled()
 await page.setViewportSize({width:1440,height:1000})
 await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 assert.equal(await page.locator('.side').evaluate(el=>Math.round(el.getBoundingClientRect().width)),72)
 await page.getByRole('button',{name:'Expand navigation',exact:true}).click()
 await page.getByRole('button',{name:'Open account menu',exact:true}).click()
 await page.getByRole('menuitem',{name:'Organization settings',exact:true}).waitFor();await page.keyboard.press('Escape')
 await page.keyboard.press('Control+k');await page.getByRole('dialog').waitFor()
 await page.getByRole('dialog').getByRole('searchbox').fill('latency')
 await page.getByRole('dialog').getByRole('button',{name:/Latency/}).click()
 await settled();assert.equal(new URL(page.url()).hash,'#latency')
 await page.goto(`${base}/#red-team?test=${test.id}`);await settled();await page.getByRole('heading',{name:'Evaluation summary'}).waitFor();await audit('red-team/report');await page.screenshot({path:'/tmp/sentinel-redesign-red-team-report.png',fullPage:true})
 await page.goto(`${base}/#users`);await settled()
 await page.getByRole('button',{name:'Person',exact:true}).click()
 await page.getByRole('button',{name:'Columns',exact:true}).click()
 await page.getByRole('menuitemcheckbox',{name:'Email address',exact:true}).click();await page.keyboard.press('Escape')
 assert.equal(await page.getByRole('columnheader',{name:'Email address'}).count(),0)
 await page.getByRole('button',{name:'Invite user',exact:true}).click()
 await page.getByRole('dialog').waitFor();await audit('users/invite-dialog')
 await page.keyboard.press('Tab');assert.equal(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)),true)
 page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'})
 for(const route of ['insights','activity-log','catalog','latency','spend']){
  mode='empty';await page.goto(`${base}/#${route}`);await settled();await noOverflow(`empty/${route}`)
 }
 mode='error';await page.goto(`${base}/#insights`);await page.getByRole('alert').waitFor();await audit('overview/error')
 mode='populated';role='user';await page.reload();await settled()
 for(const route of ['prompt-studio','activity-log','violations','catalog','latency','spend']){await page.goto(`${base}/#${route}`);await settled();assert.equal(await page.locator('.side').getByText('Manage',{exact:true}).count(),0)}
 await page.goto(`${base}/#users`);await settled();assert.equal(await page.getByRole('heading',{name:'My activity',exact:true}).count()>0,true)
 role='super_admin';await page.reload();await settled();await page.goto(`${base}/#settings`);await settled();await page.getByRole('heading',{name:'Platform organizations'}).waitFor();await audit('settings/superadmin')
 const authContext=await browser.newContext(); const auth=await authContext.newPage();auth.on('pageerror',e=>errors.push(e.message))
 await auth.route(`${base}/api/**`,route=>route.fulfill({json:{company_name:'Northstar Labs',role:'user',email:'invite@example.test'}}))
 for(const width of [1440,390]){
  await auth.setViewportSize({width,height:900})
  for(const route of ['login','signup','verify-email','forgot-password','accept-invite?token=synthetic']){
   await auth.goto(`${base}/#${route}`);await auth.locator('.auth-form').waitFor();await auth.evaluate(()=>document.fonts.ready)
   assert.equal(await auth.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`auth/${route}/${width}`)
   const result=await new AxeBuilder({page:auth}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()
   for(const v of result.violations) violations.push({page:`auth/${route}/${width}`,id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})
   if(route==='login') await auth.screenshot({path:`/tmp/sentinel-redesign-login-${width}.png`,fullPage:true})
  }
 }
 fs.writeFileSync('/tmp/sentinel-redesign-a11y.json',JSON.stringify(violations,null,2))
 console.log(JSON.stringify({routes:routes.length,viewports:3,a11yViolations:violations.length,errors,unknown},null,2))
 await browser.close()
 assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);assert.deepEqual(violations,[],'Accessibility findings: /tmp/sentinel-redesign-a11y.json')
})().catch(async e=>{console.error(e);await activeBrowser?.close();process.exitCode=1})
