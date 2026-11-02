import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFeedbackRecord} from '../feedback.js';
const id='fbcadaf1-84f6-441f-a36d-849b207e95a6';
test('saved feedback preserves a pending payload and its idempotency identity',()=>{
  const record={id,sent:false,payload:{score:4,page:'documents',submissionId:id}};
  assert.deepEqual(parseFeedbackRecord(JSON.stringify(record)),record);
});
test('invalid or corrupt browser records are discarded before rendering selectors',()=>{
  for(const record of [null,[],{}, {id,sent:'yes'},{id:'bad',sent:false},{id,sent:false,payload:{score:'4',page:'home',submissionId:id}},{id,sent:false,payload:{score:9,page:'home',submissionId:id}},{id,sent:false,payload:{score:4,page:'unknown',submissionId:id}},{id,sent:false,payload:{score:4,page:'home',submissionId:'other'}}])assert.equal(parseFeedbackRecord(JSON.stringify(record)),null);
  assert.equal(parseFeedbackRecord('{broken'),null);
});
test('completed records retain completion and discard unrelated stored fields',()=>{
  assert.deepEqual(parseFeedbackRecord(JSON.stringify({id,sent:true,extra:'discard'})),{id,sent:true});
});
