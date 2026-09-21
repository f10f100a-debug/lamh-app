const SUPABASE_URL='https://qgfuqmturtpglngpmtau.supabase.co';
const SUPABASE_KEY='sb_publishable_G3ZOB1cLQmEeyvx4UjdNew_9IMSY2Vc';

const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);

let adminCode='';
let adminPin='';
let dashboard=null;

function msg(id,text,error=false){
  const el=$(id);
  if(!el)return;
  el.textContent=text;
  el.classList.toggle('error',error);
}

async function loadDashboard(){
  const {data,error}=await db.rpc('admin_get_dashboard',{
    p_code:adminCode,
    p_pin:adminPin
  });

  if(error)throw error;

  dashboard=Array.isArray(data)?data[0]:data;
  renderDashboard();
}

function renderDashboard(){
  const c=dashboard.competition;
  const s=dashboard.stats;

  $('#dashTitle').textContent=c.title;
  $('#dashCode').textContent=c.slug;

  $('#statParticipants').textContent=s.participants;
  $('#statCompleted').textContent=s.completed;
  $('#statQuestions').textContent=s.questions;
  $('#statAnswers').textContent=s.answers;

  $('#compTitle').value=c.title||'';
  $('#compOrg').value=c.organization_name||'';
  $('#compSeconds').value=c.seconds_per_question||20;
  $('#compStatus').value=c.status||'waiting';

  if(c.start_at){
    const d=new Date(c.start_at);
    const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
    $('#compStart').value=local.toISOString().slice(0,16);
  }

  const link=`https://f10f100a-debug.github.io/lamh-app/?code=${encodeURIComponent(c.slug)}`;
  $('#joinLink').value=link;

  $('#qrBox').innerHTML='';
  new QRCode($('#qrBox'),{
    text:link,
    width:190,
    height:190
  });

  renderQuestions(dashboard.questions||[]);
  renderLeaderboard(dashboard.leaderboard||[]);
}

function renderQuestions(items){
  const box=$('#questionsList');
  box.innerHTML='';

  if(!items.length){
    box.innerHTML='<p class="hint">لا توجد أسئلة بعد.</p>';
    return;
  }

  items.forEach(q=>{
    const row=document.createElement('div');
    row.className='question-item';

    const order=document.createElement('div');
    order.className='question-order';
    order.textContent=q.question_order;

    const text=document.createElement('strong');
    text.textContent=q.question_text;

    const actions=document.createElement('div');
    actions.className='question-actions';

    const edit=document.createElement('button');
    edit.textContent='تعديل';
    edit.onclick=()=>editQuestion(q);

    const del=document.createElement('button');
    del.textContent='حذف';
    del.onclick=()=>deleteQuestion(q);

    actions.append(edit,del);
    row.append(order,text,actions);
    box.appendChild(row);
  });
}

function renderLeaderboard(items){
  const box=$('#adminLeaderboard');
  box.innerHTML='';

  if(!items.length){
    box.innerHTML='<p class="hint">لا توجد نتائج مكتملة حتى الآن.</p>';
    return;
  }

  items.forEach(x=>{
    const row=document.createElement('div');
    row.className='leader-admin-row';
    row.innerHTML=`
      <span class="rank">#${x.rank}</span>
      <div>
        <strong>${escapeHtml(x.full_name||'متسابق')}</strong>
        <div class="hint">${escapeHtml(x.school||'')}</div>
      </div>
      <strong>${x.correct_answers} صحيحة</strong>
    `;
    box.appendChild(row);
  });
}

function escapeHtml(v){
  return String(v)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

$('#loginBtn').onclick=async()=>{
  adminCode=$('#adminCode').value.trim().toUpperCase();
  adminPin=$('#adminPin').value.trim();

  if(!adminCode||!adminPin){
    msg('#loginMsg','أدخل رمز المسابقة ورمز الإدارة.',true);
    return;
  }

  msg('#loginMsg','جارٍ التحقق...');

  try{
    const {error}=await db.rpc('admin_login',{
      p_code:adminCode,
      p_pin:adminPin
    });

    if(error)throw error;

    await loadDashboard();

    $('#loginView').classList.add('hidden');
    $('#dashboardView').classList.remove('hidden');

  }catch(e){
    msg('#loginMsg',e.message||'تعذر الدخول.',true);
  }
};

$('#refreshBtn').onclick=async()=>{
  try{await loadDashboard()}catch(e){alert(e.message)}
};

$('#saveCompetitionBtn').onclick=async()=>{
  msg('#settingsMsg','جارٍ الحفظ...');

  try{
    const start=$('#compStart').value;
    const startIso=start?new Date(start).toISOString():new Date().toISOString();

    const {error}=await db.rpc('admin_update_competition',{
      p_code:adminCode,
      p_pin:adminPin,
      p_title:$('#compTitle').value.trim(),
      p_organization_name:$('#compOrg').value.trim(),
      p_start_at:startIso,
      p_status:$('#compStatus').value,
      p_seconds_per_question:Number($('#compSeconds').value||20)
    });

    if(error)throw error;

    msg('#settingsMsg','تم حفظ الإعدادات ✓');
    await loadDashboard();

  }catch(e){
    msg('#settingsMsg',e.message,true);
  }
};

$('#copyLinkBtn').onclick=async()=>{
  await navigator.clipboard.writeText($('#joinLink').value);
  $('#copyLinkBtn').textContent='تم النسخ ✓';
  setTimeout(()=>$('#copyLinkBtn').textContent='نسخ الرابط',1200);
};

$('#newQuestionBtn').onclick=()=>{
  $('#questionId').value='';
  $('#questionOrder').value=(dashboard.questions?.length||0)+1;
  $('#questionText').value='';
  $('#optionA').value='';
  $('#optionB').value='';
  $('#optionC').value='';
  $('#optionD').value='';
  $('#correctOption').value='A';
  $('#questionEditorTitle').textContent='إضافة سؤال';
  $('#questionEditor').classList.remove('hidden');
  $('#questionEditor').scrollIntoView({behavior:'smooth'});
};

function editQuestion(q){
  $('#questionId').value=q.id;
  $('#questionOrder').value=q.question_order;
  $('#questionText').value=q.question_text;
  $('#optionA').value=q.option_a;
  $('#optionB').value=q.option_b;
  $('#optionC').value=q.option_c;
  $('#optionD').value=q.option_d;
  $('#correctOption').value=q.correct_option;
  $('#questionEditorTitle').textContent='تعديل السؤال';
  $('#questionEditor').classList.remove('hidden');
  $('#questionEditor').scrollIntoView({behavior:'smooth'});
}

$('#cancelQuestionBtn').onclick=()=>{
  $('#questionEditor').classList.add('hidden');
};

$('#saveQuestionBtn').onclick=async()=>{
  msg('#questionMsg','جارٍ الحفظ...');

  try{
    const id=$('#questionId').value||null;

    const {error}=await db.rpc('admin_save_question',{
      p_code:adminCode,
      p_pin:adminPin,
      p_question_id:id,
      p_question_order:Number($('#questionOrder').value),
      p_question_text:$('#questionText').value.trim(),
      p_option_a:$('#optionA').value.trim(),
      p_option_b:$('#optionB').value.trim(),
      p_option_c:$('#optionC').value.trim(),
      p_option_d:$('#optionD').value.trim(),
      p_correct_option:$('#correctOption').value
    });

    if(error)throw error;

    msg('#questionMsg','تم حفظ السؤال ✓');
    $('#questionEditor').classList.add('hidden');
    await loadDashboard();

  }catch(e){
    msg('#questionMsg',e.message,true);
  }
};

async function deleteQuestion(q){
  if(!confirm(`حذف السؤال رقم ${q.question_order}؟`))return;

  try{
    const {error}=await db.rpc('admin_delete_question',{
      p_code:adminCode,
      p_pin:adminPin,
      p_question_id:q.id
    });

    if(error)throw error;

    await loadDashboard();

  }catch(e){
    alert(e.message);
  }
}

$('#changePinBtn').onclick=async()=>{
  const newPin=$('#newPin').value.trim();

  if(!/^\d{6}$/.test(newPin)){
    msg('#pinMsg','اكتب رمزًا جديدًا من 6 أرقام.',true);
    return;
  }

  try{
    const {error}=await db.rpc('admin_change_pin',{
      p_code:adminCode,
      p_old_pin:adminPin,
      p_new_pin:newPin
    });

    if(error)throw error;

    adminPin=newPin;
    $('#adminPin').value=newPin;
    $('#newPin').value='';
    msg('#pinMsg','تم تغيير رمز الإدارة ✓');

  }catch(e){
    msg('#pinMsg',e.message,true);
  }
};

const params=new URLSearchParams(location.search);
const preset=params.get('code');
if(preset)$('#adminCode').value=preset.toUpperCase();
