import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {payments}=JSON.parse(readFileSync(new URL('../data/demo.json',import.meta.url),'utf8'));
import {comparePayments,explainRubric,filterDocuments} from '../delivery.js';
import {crc32,createZip} from '../zip.js';
const september=payments.find(p=>p.id==='2026-09-normal');
const october=payments.find(p=>p.id==='2026-10-normal');
test('comparison distinguishes inclusion/removal and signs discounts correctly',()=>{
  const result=comparePayments(september,october);
  assert.equal(result.delta.netCents,12000);
  assert.equal(result.rows.find(r=>r.code==='090').status,'removed');
  assert.equal(result.rows.find(r=>r.code==='091').status,'included');
  assert.equal(result.rows.find(r=>r.code==='502').impactCents,-2000);
  assert.equal(result.rows.find(r=>r.code==='045').impactCents,5000);
  assert.equal(result.rows.find(r=>r.code==='001').status,'unchanged');
  assert.equal(result.reconciled,true);
});
test('reverse comparison reverses impacts; identical and different-vínculo comparisons fail',()=>{
  const reverse=comparePayments(october,september);
  assert.equal(reverse.delta.netCents,-12000);
  assert.equal(reverse.rows.find(r=>r.code==='091').status,'removed');
  assert.equal(reverse.rows.find(r=>r.code==='502').impactCents,2000);
  assert.throws(()=>comparePayments(october,october),/diferentes/);
  assert.throws(()=>comparePayments(october,{...september,registration:'OTHER'}),/mesmo vínculo/);
});
test('different types warn, unchanged periods stay unchanged, reference changes remain visible',()=>{
  assert.equal(comparePayments(september,payments.find(p=>p.id==='2026-09-ferias')).differentKinds,true);
  const july=payments.find(p=>p.id==='2026-07-normal'),august=payments.find(p=>p.id==='2026-08-normal');
  assert.equal(comparePayments(july,august).rows.every(r=>r.status==='unchanged'),true);
  const changed=structuredClone(august);changed.earnings[0].reference='Outro critério';
  const row=comparePayments(july,changed).rows.find(r=>r.code==='001');
  assert.equal(row.status,'changed');assert.equal(row.impactCents,0);
});
test('event identity includes side and consolidates split events in cents',()=>{
  const before={id:'a',registration:'x',kind:'normal',gross:0.3,discounts:0.1,net:0.2,earnings:[{code:'1',description:'E',reference:'a',amount:0.1},{code:'1',description:'E',reference:'a',amount:0.2}],deductions:[{code:'1',description:'D',reference:'a',amount:0.1}]};
  const result=comparePayments(before,{...before,id:'b',earnings:[{code:'1',description:'E',reference:'a',amount:0.3}]});
  assert.equal(result.rows.length,2);assert.equal(result.rows.every(r=>r.status==='unchanged'),true);assert.equal(result.reconciled,true);
});
test('rubric explanations distinguish the fixed vacation deduction and avoid guessing unknown codes',()=>{
  const vacation=payments.find(p=>p.id==='2026-09-ferias');
  assert.match(explainRubric(october,october.deductions[0],payments).calculation,/11%/);
  assert.match(explainRubric(vacation,vacation.deductions[0],payments).calculation,/Valor fixo/);
  assert.match(explainRubric(october,{code:'999',amount:1},payments).calculation,/não disponível/);
  assert.match(explainRubric(vacation,vacation.earnings[1],payments).calculation,/20 ÷ 30 ÷ 3/);
});
test('document filters preserve availability and support accent-insensitive searches',()=>{
  const catalog=[{id:'one',kind:'history',year:2026,month:9,title:'Férias',period:'09/2026',code:'DEMO-EVENT-1',availability:'pending'},{id:'two',kind:'income',year:2025,month:null,title:'Rendimentos',period:'2025',code:'DEMO-IR-2025-001'}];
  assert.equal(filterDocuments(catalog,{year:'2026',month:'9',kind:'history',query:'ferias'})[0].availability,'pending');
  assert.equal(filterDocuments(catalog,{kind:'income',month:'9'}).length,0);
  assert.equal(filterDocuments(catalog,{query:'DEMO-IR-2025-001'})[0].id,'two');
});

test('ZIP checksum agrees with the published CRC-32 check vector and headers identify UTF-8 stored entries',()=>{
  assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926);
  const zip=createZip([{name:'férias.html',data:'<p>Férias — fictício</p>'}]);
  const view=new DataView(zip.buffer);
  assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);
  assert.equal(view.getUint16(8,true),0);assert.equal(view.getUint32(zip.length-22,true),0x06054b50);
  assert.equal(view.getUint16(zip.length-14,true),1);
});
