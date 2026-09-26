const SUPABASE_URL='https://qgfuqmturtpglngpmtau.supabase.co';
const SUPABASE_KEY='sb_publishable_G3ZOB1cLQmEeyvx4UjdNew_9IMSY2Vc';

const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);

let adminCode='';
let adminPin='';
let dashboard=null;

$('#publishResultsBtn')?.addEventListener('click',async()=>{
  const published=dashboard?.competition?.results_published===true;
  const actionText=published?'إخفاء النتائج عن المتسابقين؟':'إعلان النتائج لجميع المتسابقين؟';
  if(!confirm(actionText))return;

  const button=$('#publishResultsBtn');
  button.disabled=true;

  try{
    const {error}=await db.rpc('admin_set_results_visibility',{
      p_code:adminCode,
      p_pin:adminPin,
      p_published:!published
    });
    if(error)throw error;
    await loadDashboard();
  }catch(e){
    msg('#publishResultsMsg',e.message||'تعذر تغيير حالة النتائج.',true);
    button.disabled=false;
  }
});

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
  const published=c.results_published===true;
  $('#publishResultsBtn').disabled=!published && c.status!=='finished';
  $('#publishResultsBtn').textContent=published?'إخفاء النتائج عن المتسابقين':'إعلان النتائج للمتسابقين';
  msg('#publishResultsMsg',
    published
      ? 'النتائج ظاهرة حاليًا للمتسابقين. يمكنك إخفاؤها وإعادة مراجعتها.'
      : c.status==='finished'
        ? 'النتائج مخفية. يمكنك إعلانها بعد المراجعة.'
        : 'النتائج مخفية. اختر «منتهية» من إعدادات المسابقة واحفظ قبل الإعلان.'
  );

  $('#dashTitle').textContent=c.title;
  $('#dashCode').textContent=c.slug;

  $('#statParticipants').textContent=s.participants;
  $('#statCompleted').textContent=s.completed;
  $('#statQuestions').textContent=s.questions;
  $('#statAnswers').textContent=s.answers;

  $('#compTitle').value=c.title||'';
  $('#compOrg').value=c.organization_name||'';
  if($('#compCode')) $('#compCode').value=c.slug||'';
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
    await loadParticipants();

    $('#loginView').classList.add('hidden');
    $('#dashboardView').classList.remove('hidden');

  }catch(e){
    msg('#loginMsg',e.message||'تعذر الدخول.',true);
  }
};

$('#refreshBtn').onclick=async()=>{
  try{
    await Promise.all([
      loadDashboard(),
      loadParticipants()
    ]);
  }catch(e){
    alert(e.message);
  }
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



let participants = [];

async function loadParticipants(){
  const {data,error}=await db.rpc('admin_list_participants',{
    p_code:adminCode,
    p_pin:adminPin
  });

  if(error)throw error;

  participants=Array.isArray(data)?data:[];
  renderParticipants(participants);
}

function renderParticipants(items){
  const box=$('#participantsList');
  if(!box)return;

  box.innerHTML='';

  if(!items.length){
    box.innerHTML='<p class="hint">لا يوجد مشاركون حتى الآن.</p>';
    return;
  }

  items.forEach(p=>{
    const row=document.createElement('div');
    row.className='participant-card';

    const head=document.createElement('div');
    head.className='participant-head';

    const identity=document.createElement('div');

    const name=document.createElement('strong');
    name.textContent=p.full_name||'مشارك';

    const meta=document.createElement('div');
    meta.className='participant-meta';
    meta.textContent=
      `${p.mobile||''} • ${p.school||''}`;

    identity.append(name,meta);

    const status=document.createElement('span');
    status.className=
      p.completed
        ? 'participant-status completed'
        : 'participant-status pending';

    status.textContent=
      p.completed ? 'مكتمل' : 'غير مكتمل';

    head.append(identity,status);

    const stats=document.createElement('div');
    stats.className='participant-stats';

    const seconds=
      (Number(p.total_response_ms||0)/1000).toFixed(2);

    stats.innerHTML=`
      <span>الإجابات: <strong>${p.answered_count||0}</strong></span>
      <span>الصحيحة: <strong>${p.correct_answers||0}</strong></span>
      <span>الزمن: <strong>${seconds} ث</strong></span>
    `;

    const actions=document.createElement('div');
    actions.className='participant-actions';

    const editBtn=document.createElement('button');
    editBtn.className='small-btn';
    editBtn.textContent='تعديل';
    editBtn.onclick=()=>editParticipant(p);

    const resetBtn=document.createElement('button');
    resetBtn.className='small-btn warning-btn';
    resetBtn.textContent='تصفير المحاولة';
    resetBtn.onclick=()=>resetParticipant(p);

    const deleteBtn=document.createElement('button'); deleteBtn.className='small-btn danger-btn'; deleteBtn.textContent='حذف'; deleteBtn.onclick=()=>deleteParticipant(p); actions.append(editBtn,resetBtn,deleteBtn);

    row.append(head,stats,actions);
    box.appendChild(row);
  });
}

function editParticipant(p){
  $('#participantId').value=p.id;
  $('#participantName').value=p.full_name||'';
  $('#participantMobile').value=p.mobile||'';
  $('#participantSchool').value=p.school||'';

  $('#participantEditor').classList.remove('hidden');

  $('#participantEditor').scrollIntoView({
    behavior:'smooth'
  });
}

async function resetParticipant(p){
  const ok=confirm(
    `هل تريد تصفير محاولة ${p.full_name}؟\nسيتم حذف إجاباته ليبدأ من جديد.`
  );

  if(!ok)return;

  try{
    const {error}=await db.rpc('admin_reset_participant',{
      p_code:adminCode,
      p_pin:adminPin,
      p_participant_id:p.id
    });

    if(error)throw error;

    await Promise.all([
      loadParticipants(),
      loadDashboard()
    ]);

  }catch(e){
    alert(e.message||'تعذر تصفير المحاولة.');
  }
}

$('#saveParticipantBtn')?.addEventListener('click',async()=>{
  msg('#participantMsg','جارٍ الحفظ...');

  const id=$('#participantId').value;
  const fullName=$('#participantName').value.trim();
  const mobile=$('#participantMobile').value.trim();
  const school=$('#participantSchool').value.trim();

  if(!fullName||!mobile||!school){
    msg('#participantMsg','أكمل جميع البيانات.',true);
    return;
  }

  try{
    const {error}=await db.rpc('admin_update_participant',{
      p_code:adminCode,
      p_pin:adminPin,
      p_participant_id:id,
      p_full_name:fullName,
      p_mobile:mobile,
      p_school:school
    });

    if(error)throw error;

    msg('#participantMsg','تم حفظ بيانات المشارك ✓');

    await Promise.all([
      loadParticipants(),
      loadDashboard()
    ]);

    setTimeout(()=>{
      $('#participantEditor').classList.add('hidden');
    },700);

  }catch(e){
    msg(
      '#participantMsg',
      e.message||'تعذر حفظ البيانات.',
      true
    );
  }
});

$('#cancelParticipantBtn')?.addEventListener('click',()=>{
  $('#participantEditor').classList.add('hidden');
});

$('#refreshParticipantsBtn')?.addEventListener('click',async()=>{
  try{
    await loadParticipants();
  }catch(e){
    alert(e.message);
  }
});

$('#participantSearch')?.addEventListener('input',e=>{
  const value=e.target.value.trim().toLowerCase();

  if(!value){
    renderParticipants(participants);
    return;
  }

  const filtered=participants.filter(p=>{
    return [
      p.full_name,
      p.mobile,
      p.school
    ]
    .filter(Boolean)
    .some(v=>String(v).toLowerCase().includes(value));
  });

  renderParticipants(filtered);
});

const params=new URLSearchParams(location.search);
const preset=params.get('code');
if(preset)$('#adminCode').value=preset.toUpperCase();


async function deleteParticipant(p){
  if(!confirm(`حذف المشارك ${p.full_name} نهائيًا؟`)) return;
  try{
    const {error}=await db.rpc('admin_delete_participant',{p_code:adminCode,p_pin:adminPin,p_participant_id:p.id});
    if(error) throw error;
    await Promise.all([loadParticipants(),loadDashboard()]);
  }catch(e){alert(e.message||'تعذر حذف المشارك.');}
}

$('#clearParticipantsBtn')?.addEventListener('click',async()=>{
  if(!confirm('سيتم حذف جميع المشاركين وإجاباتهم ومحاولاتهم. هل أنت متأكد؟')) return;
  try{
    const {error}=await db.rpc('admin_clear_participants',{p_code:adminCode,p_pin:adminPin});
    if(error) throw error;
    await Promise.all([loadParticipants(),loadDashboard()]);
    alert('تم مسح المشاركين وتجهيز المسابقة ✓');
  }catch(e){alert(e.message||'تعذر المسح.');}
});

$('#clearQuestionsBtn')?.addEventListener('click',async()=>{
  if(!confirm('سيتم حذف جميع الأسئلة والإجابات والجلسات. هل أنت متأكد؟')) return;
  try{
    const {error}=await db.rpc('admin_clear_questions',{p_code:adminCode,p_pin:adminPin});
    if(error) throw error;
    await loadDashboard();
    alert('تم مسح الأسئلة ✓');
  }catch(e){alert(e.message||'تعذر المسح.');}
});

$('#logoInput')?.addEventListener('change',async(e)=>{
  const file=e.target.files?.[0]; if(!file)return;
  if(!file.type.startsWith('image/')){alert('اختر صورة فقط.');return;}
  if(file.size>750*1024){alert('حجم الشعار يجب ألا يتجاوز 750KB.');e.target.value='';return;}
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const {error}=await db.rpc('admin_set_competition_logo',{p_code:adminCode,p_pin:adminPin,p_logo_data_uri:reader.result});
      if(error) throw error;
      msg('#logoMsg','تم تحديث شعار الجهة ✓');
      await loadDashboard();
    }catch(err){msg('#logoMsg',err.message||'تعذر حفظ الشعار.',true);}
  };
  reader.readAsDataURL(file);
});

$('#sendNotifyBtn')?.addEventListener('click',async()=>{
  const title=$('#notifyTitle').value.trim(), body=$('#notifyBody').value.trim(), kind=$('#notifyKind').value;
  if(!title||!body){msg('#notifyMsg','اكتب عنوان ونص التنبيه.',true);return;}
  const btn=$('#sendNotifyBtn'); btn.disabled=true; msg('#notifyMsg','جارٍ تجهيز التنبيه...');
  try{
    const {error}=await db.rpc('admin_queue_notification',{p_code:adminCode,p_pin:adminPin,p_title:title,p_body:body,p_kind:kind});
    if(error)throw error;
    msg('#notifyMsg','تم وضع التنبيه في طابور الإرسال ✓');
    $('#notifyBody').value='';
  }catch(e){msg('#notifyMsg',e.message||'تعذر إنشاء التنبيه.',true);}
  finally{btn.disabled=false;}
});


$('#changeCodeBtn')?.addEventListener('click',async()=>{
  const newCode=$('#compCode').value.trim().toUpperCase();
  if(!/^[A-Z0-9]{2,12}$/.test(newCode)){
    msg('#codeMsg','اكتب رمزًا من 2 إلى 12 حرفًا أو رقمًا بالإنجليزية.',true);
    return;
  }
  if(newCode===adminCode){
    msg('#codeMsg','هذا هو الرمز الحالي.');
    return;
  }
  if(!confirm(`تغيير رمز المسابقة من ${adminCode} إلى ${newCode}؟\nسيتغير رابط وQR الدخول.`)) return;

  const btn=$('#changeCodeBtn');
  btn.disabled=true;
  msg('#codeMsg','جارٍ تغيير الرمز...');
  try{
    const {data,error}=await db.rpc('admin_change_competition_code',{
      p_code:adminCode,
      p_pin:adminPin,
      p_new_code:newCode
    });
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    adminCode=result?.code||newCode;
    $('#adminCode').value=adminCode;
    $('#compCode').value=adminCode;
    const u=new URL(location.href);
    u.searchParams.set('code',adminCode);
    history.replaceState(null,'',u.toString());
    msg('#codeMsg','تم تغيير رمز المسابقة ✓');
    await loadDashboard();
  }catch(e){
    msg('#codeMsg',e.message||'تعذر تغيير رمز المسابقة.',true);
  }finally{
    btn.disabled=false;
  }
});
