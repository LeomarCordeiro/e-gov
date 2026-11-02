import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEvaluationsUI,filterEvaluations,evaluationSummary,scoreSummaryHTML} from '../evaluations-ui.js';
const {evaluations}=JSON.parse(readFileSync(new URL('../data/demo.json',import.meta.url),'utf8'));
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const context={safe,date:s=>s,heading:t=>t,icon:()=>'',link:()=>'',rolePanel:()=>'',contractSummary:()=>'',contractTabs:()=>''};

test('evaluation filtering respects section and accent-insensitive names without mixing lists',()=>{
  const items=[...evaluations,{...evaluations[0],id:'other',personName:'João Fictício'}];
  assert.equal(filterEvaluations(items,'pending','joao')[0].id,'other');
  assert.equal(filterEvaluations(items,'personal','DEMO-001').length,1);
  assert.equal(filterEvaluations(items,'answered','not-found').length,0);
});

test('completed questionnaire renders read-only answers and export, without editing actions',async()=>{
  globalThis.location={search:'?tab=avaliacoes&evaluation=demo-eval-2'};
  const item={...evaluations[1],score:10,readOnly:true};
  try{
    const html=await createEvaluationsUI({...context,api:async()=>item}).listPage();
    assert.match(html,/disabled/);assert.match(html,/readonly/);assert.match(html,/Baixar relatório HTML/);
    assert.doesNotMatch(html,/Salvar rascunho|Salvar e Finalizar|confirm-agree/);
  }finally{delete globalThis.location;}
});

test('pending science stage shows local agreement controls and locks questionnaire answers',async()=>{
  globalThis.location={search:'?evaluation=demo-eval-4'};
  try{
    const html=await createEvaluationsUI({...context,api:async()=>({...evaluations[3],score:10,readOnly:true})}).listPage();
    assert.match(html,/Concordar \(simulação\)/);assert.match(html,/Discordar \(simulação\)/);assert.match(html,/disabled/);
    assert.doesNotMatch(html,/Salvar rascunho|Salvar e Finalizar/);
  }finally{delete globalThis.location;}
});

test('export escapes question, observation and person text',()=>{
  const item=structuredClone(evaluations[1]);item.personName='<img src=x>';item.observation='<script>bad</script>';item.score=10;
  const html=evaluationSummary(item,context);
  assert.match(html,/&lt;img/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img|<script/);
});

test('failed evaluation query is not reported as an empty list',async()=>{
  globalThis.location={search:'?tab=avaliacoes'};
  try{await assert.rejects(createEvaluationsUI({...context,api:async()=>{throw new Error('Banco indisponível');}}).listPage(),/Banco indisponível/);}
  finally{delete globalThis.location;}
});

const summary={mode:'weighted-average',score:4,maximum:5,weightedTotal:12,denominator:3,answered:2,total:2,contributions:[{questionId:'q1',title:'<script>pergunta</script>',points:5,weight:2,weightedPoints:10},{questionId:'q2',title:'Comunicação',points:2,weight:1,weightedPoints:2}]};

test('score memory displays server values, partial answers and escaped text',()=>{
  const html=scoreSummaryHTML(summary,safe,true);
  assert.match(html,/Prévia da nota — não salva/);assert.match(html,/Média ponderada/);
  assert.match(html,/12 ÷ 3 = 4/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  const partial=scoreSummaryHTML({...summary,answered:1,contributions:[{...summary.contributions[1],points:null,weightedPoints:0}]},safe);
  assert.match(partial,/Nota parcial/);assert.match(partial,/Sem resposta/);assert.match(partial,/contam como zero/);
  const sum=scoreSummaryHTML({...summary,mode:'sum',score:12,maximum:15},safe);
  assert.match(sum,/Soma:/);assert.doesNotMatch(sum,/÷/);
});

test('live preview never saves, ignores older replies and offers recovery after failure',async()=>{
  const old={location:globalThis.location,document:globalThis.document,FormData:globalThis.FormData};
  const form={isConnected:true},box={innerHTML:'',setAttribute(){},removeAttribute(){}};
  const requests=[];
  globalThis.location={search:'?evaluation=demo-eval-5'};
  globalThis.document={querySelector:s=>s==='#evaluation-answer-form'?form:box};
  globalThis.FormData=class {get(name){return name==='answer-q1'?'regular':'';}};
  try{
    const ui=createEvaluationsUI({...context,api:async(path,options)=>{
      if(!options)return {...evaluations[4],score:0,readOnly:false};
      assert.equal(path,'evaluations/demo-eval-5/preview');
      assert.deepEqual(Object.keys(JSON.parse(options.body)),['answers']);
      return new Promise((resolve,reject)=>requests.push({resolve,reject}));
    }});
    await ui.listPage();
    const event={target:{matches:()=>true}};
    const first=ui.change(event),second=ui.change(event);
    requests[1].resolve(summary);await second;const newest=box.innerHTML;
    requests[0].resolve({...summary,score:1});await first;assert.equal(box.innerHTML,newest);
    const failed=ui.change(event);requests[2].reject(new Error('<falha>'));await failed;
    assert.match(box.innerHTML,/Não foi possível atualizar/);assert.match(box.innerHTML,/&lt;falha&gt;/);assert.match(box.innerHTML,/Tentar prévia novamente/);
    const away=ui.change(event);form.isConnected=false;const prior=box.innerHTML;
    requests[3].resolve(summary);await away;assert.equal(box.innerHTML,prior);
  }finally{
    for(const [name,value] of Object.entries(old))if(value===undefined)delete globalThis[name];else globalThis[name]=value;
  }
});
