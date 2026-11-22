// Isolated API fixtures: no real credentials or provider calls.
const {chromium}=require('playwright')
const AxeBuilder=require('@axe-core/playwright').default
const assert=require('node:assert/strict')
const base=process.env.UI_TEST_URL||'http://127.0.0.1:5187'
const id=n=>String(n).padStart(24,'0')
let browser
;(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']})
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage()
 page.setDefaultTimeout(15000)
 const errors=[],unexpected=[],requests=[],saved=[],audits=[]
 let mode='normal'
 const connection={id:id(8),provider:'openai',account_name:'Research workspace',status:'active',models:['gpt-4.1-mini','gpt-4.1'],model_prices:[],version:2,has_api_key:true,masked_api_key:'••••••1234',policy_count:2}
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept())
 await page.addInitScript(()=>localStorage.setItem('centurion.auth.token','synthetic-only'))
 await page.route(`${base}/api/**`,async route=>{
  const req=route.request(),p=new URL(req.url()).pathname,method=req.method(),body=req.postDataJSON()
  const send=(json,status=200)=>route.fulfill({json,status})
  if(p==='/api/auth/me')return send({id:id(1),first_name:'Ada',last_name:'Morgan',email:'ada@example.test',role:'org_admin',company:{id:id(99),name:'Northstar Labs'}})
  if(p==='/api/notifications')return send({items:[]})
  if(p==='/api/integrations'&&method==='GET')return send({items:[connection],total:1,page:1,page_size:20})
  if(p.endsWith('/available-models')&&method==='POST'){
   requests.push({p,body})
   const selectedMode=mode
   if(selectedMode==='slow')await new Promise(r=>setTimeout(r,600))
   if(selectedMode==='error')return send({detail:{message:'Provider rejected this credential'}},400)
   return send({models:selectedMode==='empty'?[]:selectedMode==='many'?Array.from({length:52},(_,i)=>`model-${String(i+1).padStart(2,'0')}`):['gpt-4.1','gpt-4.1-mini','o4-mini']})
  }
  if((p==='/api/integrations'&&method==='POST')||(p===`/api/integrations/${id(8)}`&&method==='PUT')){saved.push({p,body,method});return send({message:'Integration saved',integration:{...connection,...body}})}
  unexpected.push(`${method} ${p}`);return route.abort()
 })
 const audit=async label=>{const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();result.violations.forEach(v=>audits.push({label,id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))}
 const dialog=()=>page.getByRole('dialog')
 const close=async()=>{await dialog().getByRole('button',{name:/^Close /}).click();await dialog().waitFor({state:'hidden'})}
 const connect=async name=>{await page.getByRole('button',{name:`Connect ${name}`,exact:true}).click();await dialog().waitFor()}
 const load=async()=>{await dialog().getByRole('button',{name:/^(Load|Reload) models$/}).click();await dialog().getByText(/\d+ available/, {exact:true}).waitFor()}
 const checkOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await page.goto(`${base}/#integrations`)
 await page.getByRole('button',{name:'Connect OpenAI',exact:true}).waitFor()
 assert.equal(await page.locator('.provider-card').count(),6)
 await audit('directory/desktop');await checkOverflow()
 await page.screenshot({path:'/tmp/sentinel-integrations-providers.png',fullPage:true})
 for(const [name,value]of [['OpenAI','openai'],['Groq','groq'],['Ollama','ollama'],['Gemini','gemini'],['DeepSeek','deepseek'],['Anthropic','anthropic']]){
  await connect(name);assert.equal(await dialog().getByLabel('Provider',{exact:true}).inputValue(),value)
  assert.equal(await dialog().getByRole('button',{name:'Save integration',exact:true}).isDisabled(),true)
  if(value==='ollama'){await dialog().getByLabel('Allowed Ollama origin').fill('http://127.0.0.1:11434');await dialog().getByLabel('Account name').fill('Local models');await load();assert.equal(requests.at(-1).body.api_key,null);assert.equal(requests.at(-1).body.base_url,'http://127.0.0.1:11434')}
  await close()
 }
 await connect('OpenAI')
 await dialog().getByLabel('Account name').fill('Product workspace');await dialog().getByLabel(/API key/).fill('synthetic-test-key')
 await load();assert.equal(requests.at(-1).body.provider,'openai')
 await dialog().getByRole('button',{name:'Select all',exact:true}).click()
 assert.equal(await dialog().getByRole('checkbox',{checked:true}).count(),3)
 await dialog().getByRole('checkbox',{name:'o4-mini',exact:true}).uncheck()
 await dialog().getByRole('searchbox',{name:'Search available models'}).fill('mini')
 assert.equal(await dialog().getByRole('checkbox').count(),2)
 await dialog().getByRole('searchbox',{name:'Search available models'}).fill('absent')
 await dialog().getByText('No matching models',{exact:true}).waitFor()
 await dialog().getByRole('button',{name:'Clear search',exact:true}).click()
 await audit('picker/desktop')
 await page.screenshot({path:'/tmp/sentinel-integrations-model-picker.png',fullPage:true})
 await dialog().getByText('Pricing and system instructions',{exact:false}).click()
 await dialog().getByLabel('gpt-4.1 input',{exact:true}).fill('2');await dialog().getByLabel('gpt-4.1 output',{exact:true}).fill('8')
 await dialog().getByLabel('System instructions (admin-managed)').fill('Be concise.')
 await dialog().getByRole('button',{name:'Save integration',exact:true}).click();await dialog().waitFor({state:'hidden'})
 assert.deepEqual(saved.at(-1).body.models,['gpt-4.1','gpt-4.1-mini'])
 assert.deepEqual(saved.at(-1).body.model_prices,[{model:'gpt-4.1',input_usd_per_million:'2',output_usd_per_million:'8'}])
 assert.equal(saved.at(-1).body.system_prompt,'Be concise.');assert.equal(saved.at(-1).body.api_key,'synthetic-test-key');assert.equal(saved.at(-1).body.base_url,null)
 await page.getByRole('button',{name:'Edit',exact:true}).click()
 await load();assert.equal(requests.at(-1).p,`/api/integrations/${id(8)}/available-models`)
 await dialog().getByRole('button',{name:'Clear selection',exact:true}).click();assert.equal(await dialog().getByRole('button',{name:'Save integration',exact:true}).isDisabled(),true)
 await dialog().getByRole('checkbox',{name:'o4-mini',exact:true}).check()
 await dialog().getByRole('button',{name:'Save integration',exact:true}).click();await dialog().waitFor({state:'hidden'})
 assert.equal(saved.at(-1).method,'PUT');assert.equal(saved.at(-1).body.api_key,null);assert.equal(saved.at(-1).body.version,2)
 await connect('Gemini');await dialog().getByLabel(/API key/).fill('synthetic-test-key')
 mode='error';await dialog().getByRole('button',{name:'Load models',exact:true}).click();await dialog().getByRole('alert').filter({hasText:'Provider rejected this credential'}).waitFor()
 mode='empty';await dialog().getByRole('button',{name:'Load models',exact:true}).click();await dialog().getByText('No models returned',{exact:true}).waitFor();await audit('empty/discovery')
 mode='slow';await dialog().getByRole('button',{name:'Reload models',exact:true}).click();await dialog().getByText('Loading available models',{exact:true}).waitFor()
 await dialog().getByLabel(/API key/).fill('changed-synthetic-key');await page.waitForTimeout(750)
 assert.equal(await dialog().getByRole('checkbox').count(),0,'Discard model discovery from stale credentials')
 assert.equal(await dialog().getByRole('button',{name:'Load models',exact:true}).isDisabled(),false,'Credential edits must not leave discovery stuck')
 mode='many';await load();assert.equal(await dialog().getByRole('button',{name:'Select all',exact:true}).isDisabled(),true)
 for(const box of await dialog().getByRole('checkbox').all().then(items=>items.slice(0,50)))await box.check()
 assert.equal(await dialog().getByRole('checkbox',{checked:true}).count(),50)
 assert.equal(await dialog().getByRole('checkbox',{name:'model-51',exact:true}).isDisabled(),true)
 await dialog().getByRole('checkbox',{name:'model-01',exact:true}).uncheck();assert.equal(await dialog().getByRole('checkbox',{name:'model-51',exact:true}).isDisabled(),false)
 await close();mode='normal'
 for(const width of [768,390]){
  await page.setViewportSize({width,height:850});await checkOverflow();await audit(`directory/${width}`)
  await connect('Anthropic');await dialog().getByLabel(/API key/).fill('synthetic-test-key');await load();await dialog().getByRole('button',{name:'Select all',exact:true}).click()
  await checkOverflow();await audit(`picker/${width}`)
  const footer=await dialog().getByRole('button',{name:'Save integration',exact:true}).boundingBox();assert.equal(footer.y+footer.height<=850,true,'Save remains visible on small screens')
  await page.screenshot({path:`/tmp/sentinel-integrations-picker-${width}.png`,fullPage:true})
  await close()
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(audits,[])
 console.log('PASS: all six provider presets; discovery; select all/manual/search; create/update payloads; saved credentials; error/empty/stale discovery; 50-model limit; desktop/tablet/mobile; zero accessibility or console errors.')
 await browser.close()
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1})
