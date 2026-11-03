import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluationResourcesHTML,evaluationFlowReport,uploadEvaluationAttachment} from '../evaluation-resources.js';
import {createEvaluationsUI} from '../evaluations-ui.js';
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const policy={maxBytes:2097152,maxFiles:5,extensions:['pdf','txt']};
const file={id:'1',filename:'<script>.txt',bytes:20,actor:'servidor',createdAt:'2026-11-02T12:00:00Z'};
const item={...JSON.parse(readFileSync(new URL('../data/demo.json',import.meta.url),'utf8')).evaluations[5],score:0,readOnly:false,attachmentPolicy:policy,attachments:[file],events:[],workflow:{stage:'filling',label:'Preenchimento',actions:[]}};
const context={safe,date:s=>s,heading:t=>t,icon:()=>'',link:()=>'',rolePanel:()=>'',contractSummary:()=>'',contractTabs:()=>'',toast:()=>{},getRole:()=> 'servidor'};

test('attachment controls honor stage, role and capacity while escaping filenames',()=>{
  const html=evaluationResourcesHTML(item,context);
  assert.match(html,/evaluation-attachment-form/);assert.match(html,/accept=".pdf,.txt"/);assert.match(html,/&lt;script&gt;.txt/);assert.doesNotMatch(html,/<script>/);
  assert.doesNotMatch(evaluationResourcesHTML(item,{...context,getRole:()=> 'rh'}),/evaluation-attachment-form/);
  assert.doesNotMatch(evaluationResourcesHTML({...item,attachments:Array(5).fill(file)},context),/evaluation-attachment-form/);
  const completed=evaluationResourcesHTML({...item,readOnly:true,workflow:{stage:'completed',label:'Concluído',actions:[]}},context);
  assert.doesNotMatch(completed,/evaluation-attachment-form|confirm-workflow/);assert.match(completed,/download-attachment/);
});

test('workflow shows only the current role actions and retains return reasons',()=>{
  const reviewing={...item,readOnly:true,workflow:{stage:'review',label:'Revisão',actions:[{action:'return',role:'rh',label:'Devolver para ajustes'},{action:'approve',role:'rh',label:'Encaminhar para ciência'}]},events:[{action:'return',stage:'filling',actor:'rh',observation:'<motivo>',createdAt:file.createdAt}]};
  const rh=evaluationResourcesHTML(reviewing,{...context,getRole:()=> 'rh'});
  assert.match(rh,/Devolver para ajustes/);assert.match(rh,/Encaminhar para ciência/);assert.match(rh,/&lt;motivo&gt;/);
  assert.doesNotMatch(evaluationResourcesHTML(reviewing,context),/confirm-workflow/);
});

test('downloaded report includes local stages and file metadata without pretending to embed attachments',()=>{
  const html=evaluationFlowReport({...item,events:[{action:'submitted',actor:'servidor',observation:'<nota>',createdAt:file.createdAt}]},safe);
  assert.match(html,/não estão incorporados/);assert.match(html,/&lt;script&gt;.txt/);assert.match(html,/&lt;nota&gt;/);assert.doesNotMatch(html,/<script>|data:|<iframe/);
});

test('upload sends raw bytes with encoded filename and rejects incompatible size or extension',async()=>{
  const chosen={name:'exemplo fictício.TXT',size:10};
  const result=await uploadEvaluationAttachment(async(path,options)=>{
    assert.equal(path,'evaluations/demo-eval-6/attachments?filename=exemplo%20fict%C3%ADcio.TXT');assert.equal(options.body,chosen);assert.equal(options.headers['Content-Type'],'application/octet-stream');return {id:'1'};
  },'demo-eval-6',chosen,policy);
  assert.equal(result.id,'1');
  for(const invalid of [{name:'a.txt',size:0},{name:'a.txt',size:policy.maxBytes+1},{name:'a.html',size:10}])await assert.rejects(uploadEvaluationAttachment(()=>assert.fail('must not call API'),'demo-eval-6',invalid,policy));
  await assert.rejects(uploadEvaluationAttachment(async()=>{throw new Error('Banco indisponível');},'demo-eval-6',chosen,policy),/Banco indisponível/);
});

test('RH cannot edit answers or attach files while reviewing the workflow example',async()=>{
  const old=globalThis.location;globalThis.location={search:'?evaluation=demo-eval-6'};
  try{
    const html=await createEvaluationsUI({...context,getRole:()=> 'rh',api:async()=>({...item,status:'in-review',readOnly:true,workflow:{stage:'review',label:'Revisão',actions:[{action:'return',role:'rh',label:'Devolver para ajustes'}]}})}).listPage();
    assert.match(html,/disabled/);assert.match(html,/Devolver para ajustes/);assert.doesNotMatch(html,/Salvar rascunho|evaluation-attachment-form|Salvar e enviar/);
  }finally{if(old===undefined)delete globalThis.location;else globalThis.location=old;}
});

test('upload refreshes only resources and leaves the unsaved question form intact',async()=>{
  const old={location:globalThis.location,document:globalThis.document,FormData:globalThis.FormData};
  const button={disabled:false,isConnected:true},box={textContent:'',isConnected:true,focus(){}},resources={innerHTML:''},status={textContent:''};
  const form={id:'evaluation-attachment-form',querySelector:()=>button};
  const chosen={name:'exemplo.txt',size:10};let uploads=0;
  globalThis.location={search:'?evaluation=demo-eval-6'};
  globalThis.document={querySelector:s=>({'#evaluation-attachment-error':box,'#evaluation-resources':resources,'#evaluation-status-label':status})[s]};
  globalThis.FormData=class {get(){return chosen;}};
  try{
    const ui=createEvaluationsUI({...context,render:()=>assert.fail('must preserve question form'),api:async(path,options)=>{if(options){uploads++;return {id:'1'};}return {...structuredClone(item),status:uploads?'draft':'pending'};}});
    await ui.listPage();await ui.submit({target:form,preventDefault(){}});
    assert.equal(uploads,1);assert.match(resources.innerHTML,/Anexos da avaliação/);assert.equal(status.textContent,'Rascunho');assert.equal(button.disabled,false);
  }finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});

test('confirmed upload followed by a failed refresh is reported as saved and offers list recovery',async()=>{
  const old={location:globalThis.location,document:globalThis.document,FormData:globalThis.FormData};
  const button={isConnected:true},box={isConnected:true,focus(){}},form={id:'evaluation-attachment-form',querySelector:()=>button};
  let uploaded=false;
  globalThis.location={search:'?evaluation=demo-eval-6'};globalThis.document={querySelector:()=>box};globalThis.FormData=class {get(){return {name:'exemplo.txt',size:10};}};
  try{
    const ui=createEvaluationsUI({...context,api:async(path,options)=>{if(options){uploaded=true;return {id:'1'};}if(uploaded)throw new Error('<consulta indisponível>');return item;}});
    await ui.listPage();await ui.submit({target:form,preventDefault(){}});
    assert.match(box.innerHTML,/Anexo salvo/);assert.match(box.innerHTML,/Não repita o envio/);assert.match(box.innerHTML,/refresh-resources/);assert.match(box.innerHTML,/&lt;consulta indisponível&gt;/);
  }finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});

test('workflow confirmation names the selected action and sends it to the workflow endpoint',async()=>{
  const old={location:globalThis.location,document:globalThis.document};let modalHTML='',saved;
  globalThis.location={search:'?evaluation=demo-eval-6'};globalThis.document={querySelector:()=>({value:'Revisar o exemplo'})};
  try{
    const reviewing={...item,status:'in-review',readOnly:true,workflow:{stage:'review',label:'Revisão',actions:[{action:'return',role:'rh',label:'Devolver para ajustes'}]}};
    const ui=createEvaluationsUI({...context,getRole:()=> 'rh',modal:(title,html)=>modalHTML=html,closeModal(){},render:async()=>{},refreshBadge:async()=>{},api:async(path,options)=>{if(options){saved={path,body:JSON.parse(options.body)};return {};}return reviewing;}});
    await ui.listPage();await ui.click({dataset:{evaluation:'confirm-workflow',action:'return'}});assert.match(modalHTML,/Devolver para ajustes/);
    await ui.click({dataset:{evaluation:'confirm'}});assert.equal(saved.path,'evaluations/demo-eval-6/workflow');assert.deepEqual(saved.body,{action:'return',observation:'Revisar o exemplo'});
  }finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v;}
});
