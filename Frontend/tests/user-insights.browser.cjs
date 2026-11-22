// Real API contract, isolated synthetic records. No customer or provider requests.
const { chromium } = require('playwright')
const AxeBuilder = require('@axe-core/playwright').default
const assert = require('node:assert/strict')
const fs = require('node:fs')
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5187'
const id = n => String(n).padStart(24, '0')
const people = Array.from({length:21},(_,i)=>({id:id(i+1),first_name:i===0?'Ada':i===1?'Omar':i===2?'Maya':'Person',last_name:i===0?'Morgan':i===1?'Khan':i===2?'Chen':String(i+1),email:`person${i+1}@example.test`,department:'Engineering',role:i===0?'org_admin':'user',account_status:i===2?'inactive':'active',is_active:i!==2,group_ids:[id(60)],version:1}))
let browser
;(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']})
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 const page=await context.newPage()
 page.setDefaultTimeout(15000)
 const errors=[],requests=[],unexpected=[],accessibility=[]
 let role='org_admin',failReport=false,slowAda=false
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>localStorage.setItem('centurion.auth.token','synthetic-only'))
 await page.route(`${base}/api/**`,async route=>{
  const request=route.request(),url=new URL(request.url()),p=url.pathname
  const send=(json,status=200)=>route.fulfill({json,status})
  if(request.method()!=='GET') {unexpected.push(`${request.method()} ${p}`);return route.abort()}
  if(p==='/api/auth/me') return send({...people[0],role,company:{id:id(99),name:'Northstar Labs'}})
  if(p==='/api/notifications') return send({items:[]})
  if(p==='/api/users') {
   const q=(url.searchParams.get('q')||'').toLowerCase(),status=url.searchParams.get('status')
   const rows=people.filter(p=>(`${p.first_name} ${p.last_name} ${p.email}`).toLowerCase().includes(q)&&(!status||p.account_status===status))
   const number=Number(url.searchParams.get('page')||1)
   return send({items:rows.slice((number-1)*20,number*20),total:rows.length,page:number,page_size:20})
  }
  if(p.startsWith('/api/analytics/')) {
   const userId=url.searchParams.get('user_id')||'',from=url.searchParams.get('from'),to=url.searchParams.get('to')
   requests.push({p,userId,from,to})
   assert.equal(new Date(from).toISOString(),from)
   assert.equal(new Date(to).toISOString(),to)
   const days=(Date.parse(to)-Date.parse(from))/86400000
   assert.equal([7,30,90].includes(days),true)
   if(slowAda&&userId===id(1)) await new Promise(resolve=>setTimeout(resolve,800))
   if(failReport) return send({detail:{message:'Analytics temporarily unavailable'}},503)
   const total=userId===id(3)?0:userId===id(1)?7:userId===id(2)?9:16
   const blocked=total?2:0,allowed=total?total-3:0
   const summary={filters:{from,to,user_id:userId},generated_at:to,total_submissions:total,allowed,blocked,errors:{provider_error:total?1:0},processing:0,violation_events:blocked,runs_with_violations:blocked,violation_rate:total?blocked/(total-1):null,violation_rate_denominator:Math.max(0,total-1),evaluation_coverage:total?(total-1)/total:null,incomplete_evaluation:total?1:0,known_prompt_tokens:total*100,known_completion_tokens:total*30,estimated_cost_usd:total?'0.024':'0',unknown_usage_runs:total?1:0,unknown_cost_runs:total?1:0,legacy_history_count:0,latency:total?{provider_latency_ms:{count:total,p50:600,p95:850,p99:980},enforcement_latency_ms:{count:total,p50:95,p95:130,p99:190},total_latency_ms:{count:total,p50:710,p95:990,p99:1150}}:{}}
   if(p.endsWith('/summary')) return send(summary)
   if(p.endsWith('/series')) return send({items:total?[{date:`${from.slice(0,10)}T00:00:00Z`,status:'allowed',count:allowed},{date:`${to.slice(0,10)}T00:00:00Z`,status:'blocked_input',count:blocked},{date:`${to.slice(0,10)}T00:00:00Z`,status:'provider_error',count:1}]:[]})
   if(p.endsWith('/models')) return send({items:total?[{provider:'openai',model:'gpt-4.1-mini',runs:total,known_tokens:total*130,estimated_cost_usd:'0.024',unknown_usage_runs:1,unknown_cost_runs:1}]:[]})
  }
  if(p==='/api/prompt-workspace/context') return send({integrations:[],groups:[],input_policy_coverage:{},require_active_policy:false,enforcement_ready:true})
  if(p==='/api/prompt-workspace/runs') return send({items:[],total:0,page:1,page_size:5})
  if(p==='/api/prompt-workspace/conversations') return send({items:[],total:0,page:1,page_size:20})
  unexpected.push(p);return route.abort()
 })
 const ready=async()=>{
  await page.waitForFunction(()=>!document.querySelector('.loading-surface'))
  await page.locator('.user-insight-metrics').waitFor()
  await page.waitForTimeout(150)
 }
 const metric=()=>page.locator('.user-insight-metrics > div').first().locator('strong')
 const audit=async label=>{
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()
  result.violations.forEach(v=>accessibility.push({label,id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))
 }
 await page.goto(`${base}/#user-insights`)
 await ready();assert.equal(await metric().innerText(),'16')
 const nav=page.locator('.side .nav-section').filter({has:page.getByRole('heading',{name:'Manage',exact:true})})
 await nav.getByRole('button',{name:'User insights',exact:true}).waitFor()
 await page.locator('.user-directory-person').first().waitFor()
 await page.screenshot({path:'/tmp/sentinel-user-insights-organization.png',fullPage:true})
 await page.getByRole('button',{name:/Ada Morgan Engineering/}).click();await ready()
 assert.equal(await metric().innerText(),'7')
 await page.getByRole('heading',{name:'Ada Morgan',exact:true}).waitFor()
 assert.equal(requests.slice(-3).every(r=>r.userId===id(1)),true)
 assert.equal(new Set(requests.slice(-3).map(r=>r.from)).size,1)
 await audit('individual/desktop')
 await page.screenshot({path:'/tmp/sentinel-user-insights-individual.png',fullPage:true})
 for(const days of [30,90]){
  await page.getByRole('combobox',{name:'User insights reporting period'}).selectOption(String(days));await ready()
  assert.equal(requests.slice(-3).every(r=>r.userId===id(1)&&(Date.parse(r.to)-Date.parse(r.from))/86400000===days),true)
 }
 slowAda=true
 await page.getByRole('button',{name:/Omar Khan Engineering/}).click();await ready()
 await page.getByRole('button',{name:/Ada Morgan Engineering/}).click()
 await page.waitForFunction(()=>document.querySelector('.loading-surface'))
 await page.getByRole('button',{name:/Omar Khan Engineering/}).click();await ready()
 await page.waitForTimeout(1000)
 assert.equal(await metric().innerText(),'9','Late results must never overwrite the selected person')
 await page.getByRole('heading',{name:'Omar Khan',exact:true}).waitFor();slowAda=false
 await page.getByRole('searchbox',{name:'Search people for insights'}).fill('absent-person')
 await page.getByRole('heading',{name:'No matching people'}).waitFor()
 assert.equal(await metric().innerText(),'9','Searching the directory must not silently change report scope')
 await page.getByRole('button',{name:'Clear filters',exact:true}).click()
 await page.locator('.user-directory-person').first().waitFor()
 await page.getByRole('button',{name:'Next page',exact:true}).click()
 await page.getByRole('button',{name:/Person 21 Engineering/}).waitFor()
 await page.getByRole('button',{name:'Previous page',exact:true}).click()
 await page.getByRole('button',{name:/Maya Chen Engineering/}).click();await ready()
 assert.equal(await metric().innerText(),'0')
 await page.getByRole('heading',{name:'No outcomes in this period'}).waitFor();await audit('empty/individual')
 failReport=true;await page.getByRole('button',{name:'Refresh',exact:true}).click()
 await page.getByText('Analytics temporarily unavailable',{exact:true}).waitFor()
 assert.equal(await page.locator('.user-insight-metrics').count(),0)
 failReport=false;await page.getByRole('button',{name:'Retry report',exact:true}).click();await ready()
 await page.getByRole('button',{name:/Ada Morgan Engineering/}).click();await ready()
 for(const width of [768,390,320]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(200)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`overflow/${width}`)
  await audit(`individual/${width}`)
  await page.screenshot({path:`/tmp/sentinel-user-insights-${width}.png`,fullPage:true})
 }
 role='user';await page.reload()
 await page.getByRole('heading',{name:'My activity',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'User insights',exact:true}).count(),0)
 fs.writeFileSync('/tmp/sentinel-user-insights-a11y.json',JSON.stringify(accessibility,null,2))
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(accessibility,[])
 console.log('PASS: user insights, real filters, all-user and individual scope, identical query intervals, 7/30/90 days, stale-response isolation, search/pagination, zero activity, error recovery, desktop/tablet/mobile, admin-only navigation, no JS errors, zero axe findings.')
 await browser.close()
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1})
