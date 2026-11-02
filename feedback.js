const pages=new Set(['home','holerites','history','income','verify','compare','documents','requests','notices','reports','consignments']);
export function parseFeedbackRecord(raw) {
  try {
    const r=JSON.parse(raw);
    if(!r || typeof r.id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.id) || typeof r.sent!=='boolean')return null;
    if(r.payload && (!Number.isInteger(r.payload.score)||r.payload.score<1||r.payload.score>5||!pages.has(r.payload.page)||r.payload.submissionId!==r.id))return null;
    return {id:r.id,sent:r.sent,...(r.payload?{payload:{score:r.payload.score,page:r.payload.page,submissionId:r.id}}:{})};
  } catch {return null;}
}
export function createFeedback({api,toast}) {
  const panel=document.querySelector('#feedback-panel');
  const form=document.querySelector('#feedback-form');
  const status=document.querySelector('#feedback-status');
  const key='arquimetria-experience-v1';
  let record;
  try { record=parseFeedbackRecord(localStorage.getItem(key)); } catch {}
  if(!record?.id) record={id:crypto.randomUUID(),sent:false};
  function save(){try{localStorage.setItem(key,JSON.stringify(record));}catch{}}
  save();
  if(record.payload){
    form.querySelector(`input[value="${record.payload.score}"]`).checked=true;
    form.querySelectorAll('input').forEach(input=>input.disabled=true);
    form.querySelector('button[type=submit]').disabled=false;
  }
  let pending=false, dismissed=false;
  function show(manual=false){
    if(!manual&&(record.sent||dismissed||document.querySelector('dialog[open]')))return;
    panel.hidden=false;
    form.hidden=record.sent;
    status.textContent=record.sent?'Obrigado! Sua avaliação já foi registrada neste navegador.':'';
    if(manual)panel.querySelector('#feedback-title').focus();
  }
  function completed(){pending=true;show();}
  document.querySelector('#modal').addEventListener('close',()=>{if(pending)show();});
  document.querySelector('#open-feedback').addEventListener('click',()=>show(true));
  document.querySelector('#close-feedback').addEventListener('click',()=>{
    panel.hidden=true;dismissed=true;document.querySelector('#open-feedback').focus();
  });
  form.addEventListener('change',()=>{form.querySelector('button[type=submit]').disabled=!form.querySelector('input:checked');});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const chosen=form.querySelector('input:checked');if(!chosen)return;
    const button=form.querySelector('button[type=submit]');button.disabled=true;status.textContent='Registrando sua avaliação…';
    try{
      if(!record.payload){record.payload={score:Number(chosen.value),page:document.querySelector('#main')?.dataset.route||'home',submissionId:record.id};save();}
      form.querySelectorAll('input').forEach(input=>input.disabled=true);
      await api('feedback',{method:'POST',body:JSON.stringify(record.payload)});
      record.sent=true;save();form.hidden=true;status.textContent='Obrigado! Sua avaliação foi salva no ambiente local.';toast('Avaliação registrada.');
    }catch(e){status.textContent=e.message;button.disabled=false;}
  });
  return {completed};
}
