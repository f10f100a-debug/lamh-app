/* =========================================================
   لَمْح | LAMH
   منصة المسابقات
   المطور والمصمم / فهد اللهيبي
   ========================================================= */

const SUPABASE_URL = 'https://qgfuqmturtpglngpmtau.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G3ZOB1cLQmEeyvx4UjdNew_9IMSY2Vc';

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* ---------- الحالة العامة ---------- */

let participantId = null;
let competitionId = null;
let competition = null;
let competitionCode = null;

let questions = [];
let currentQuestion = 0;

let questionStartedAt = 0;
let waitingTimer = null;
let submitting = false;


/* ---------- أدوات ---------- */

const $ = (selector) => document.querySelector(selector);

function show(screenId) {
  ['join', 'waiting', 'quiz', 'result'].forEach(id => {
    const element = $('#' + id);

    if (element) {
      element.classList.toggle('hidden', id !== screenId);
    }
  });
}

function setMessage(text, isError = false) {
  const element = $('#hello');

  if (!element) return;

  element.textContent = text;
  element.classList.toggle('error', isError);
}

function cleanPhone(value) {
  return value.replace(/[^\d+]/g, '');
}


/* =========================================================
   1 ـ دخول المتسابق
   ========================================================= */

const params = new URLSearchParams(window.location.search);
const presetCode = params.get('code');

if (presetCode && $('#code')) {
  $('#code').value = presetCode.toUpperCase();
}

const joinForm = $('#joinForm');

if (joinForm) {

  joinForm.addEventListener('submit', async (event) => {

    event.preventDefault();

    if (submitting) return;

    const fullName = $('#name')?.value.trim() || '';
    const phone = cleanPhone($('#phone')?.value.trim() || '');
    const school = $('#school')?.value.trim() || '';
    const code = ($('#code')?.value.trim() || '').toUpperCase();
    competitionCode = code;

    if (!fullName || !phone || !school || !code) {
      setMessage(
        'يرجى تعبئة الاسم الثلاثي ورقم الجوال والمدرسة ورمز المسابقة.',
        true
      );
      return;
    }

    const nameParts = fullName
      .split(/\s+/)
      .filter(Boolean);

    if (nameParts.length < 3) {
      setMessage('يرجى كتابة الاسم الثلاثي كاملًا.', true);
      return;
    }

    if (!/^05\d{8}$/.test(phone)) {
      setMessage(
        'رقم الجوال يجب أن يكون بصيغة 05XXXXXXXX.',
        true
      );
      return;
    }

    submitting = true;
    setMessage('جارٍ التحقق من المسابقة...');

    const submitButton =
      joinForm.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'جارٍ الدخول...';
    }

    try {

      /*
        الدالة الموجودة فعليًا في Supabase:
        join_competition(
          p_code text,
          p_full_name text,
          p_phone text,
          p_school text
        )
      */

      const { data, error } = await db.rpc(
        'join_competition',
        {
          p_code: code,
          p_full_name: fullName,
          p_phone: phone,
          p_school: school
        }
      );

      if (error) {
        throw error;
      }

      console.log('join_competition:', data);

      const result =
        Array.isArray(data)
          ? data[0]
          : data;

      if (!result) {
        throw new Error(
          'لم ترجع قاعدة البيانات بيانات التسجيل.'
        );
      }

      /*
        دعم أكثر من شكل محتمل لنتيجة JSON
        دون تغيير قاعدة البيانات.
      */

      participantId =
        result.participant_id ??
        result.participantId ??
        result.id ??
        null;

      competitionId =
        result.competition_id ??
        result.competitionId ??
        null;

      /*
        بعض الدوال قد تعيد JSON داخل خاصية أخرى.
      */

      if (!participantId && result.participant) {
        participantId =
          result.participant.id ??
          result.participant.participant_id ??
          null;
      }

      if (!competitionId && result.competition) {
        competitionId =
          result.competition.id ??
          result.competition.competition_id ??
          null;
      }

      /*
        إذا أعادت الدالة code بدل competition_id
        نحصل على المسابقة من الجدول.
      */

      if (!competitionId) {

        const { data: compData, error: compError } =
          await db
            .from('competitions')
            .select('*')
            .eq('code', code)
            .maybeSingle();

        if (compError) {
          throw compError;
        }

        if (compData) {
          competitionId = compData.id;
          competition = compData;
        }
      }

      if (!participantId) {
        throw new Error(
          'تم الاتصال بقاعدة البيانات ولكن لم يتم الحصول على رقم المتسابق.'
        );
      }

      if (!competitionId) {
        throw new Error(
          'لم يتم العثور على المسابقة المرتبطة بهذا الرمز.'
        );
      }

      show('waiting');

      const waitingHello = $('#waiting h2');

      if (waitingHello) {
        waitingHello.textContent =
          `أهلًا ${fullName}، استعد للمسابقة`;
      }

      await loadCompetition();

    } catch (error) {

      console.error('JOIN ERROR:', error);

      let message =
        error?.message ||
        'تعذر الدخول إلى المسابقة.';

      setMessage(message, true);

      show('join');

    } finally {

      submitting = false;

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'دخول المسابقة';
      }
    }
  });
}


/* =========================================================
   2 ـ تحميل المسابقة والأسئلة
   ========================================================= */

async function loadCompetition() {
  try {
    const {data,error}=await db.rpc('get_public_competition',{p_code:competitionCode});
    if(error) throw error;
    competition=Array.isArray(data)?data[0]:data;
    if(!competition) throw new Error('المسابقة غير موجودة.');
    if(competition.status==='finished') return finishCompetition();
    if(competition.status==='live') return startQuiz();
    const start=competition.start_at?new Date(competition.start_at).getTime():NaN;
    if(!Number.isNaN(start)&&Date.now()<start){show('waiting');startWaitingCountdown(start);startWaitingPolling();return;}
    startWaitingPolling();
  }catch(e){console.error('LOAD ERROR',e);setMessage(e.message||'تعذر تحميل المسابقة.',true);show('join');}
}
function startWaitingPolling(){
  clearInterval(waitingTimer);
  waitingTimer=setInterval(async()=>{
    try{
      const {data,error}=await db.rpc('get_public_competition',{p_code:competitionCode});
      if(error) throw error;
      competition=Array.isArray(data)?data[0]:data;
      if(competition?.status==='live'){clearInterval(waitingTimer);await startQuiz();}
      else if(competition?.status==='finished'){clearInterval(waitingTimer);await finishCompetition();}
    }catch(e){console.warn('WAIT POLL',e);}
  },2000);
}


/* =========================================================
   3 ـ غرفة الانتظار
   ========================================================= */

function startWaitingCountdown(startTimestamp) {

  clearInterval(waitingTimer);

  function updateCountdown() {

    const remaining =
      startTimestamp - Date.now();

    if (remaining <= 0) {

      clearInterval(waitingTimer);

      const count = $('#count');

      if (count) {
        count.textContent = 'ابدأ!';
      }

      setTimeout(startQuiz, 300);
      return;
    }

    const totalSeconds =
      Math.ceil(remaining / 1000);

    const hours =
      Math.floor(totalSeconds / 3600);

    const minutes =
      Math.floor((totalSeconds % 3600) / 60);

    const seconds =
      totalSeconds % 60;

    const count = $('#count');

    if (!count) return;

    if (hours > 0) {

      count.textContent =
        `${String(hours).padStart(2, '0')}:` +
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}`;

    } else {

      count.textContent =
        `${String(minutes).padStart(2, '0')}:` +
        `${String(seconds).padStart(2, '0')}`;
    }
  }

  updateCountdown();

  waitingTimer =
    setInterval(updateCountdown, 250);
}


/* =========================================================
   4 ـ بدء المسابقة
   ========================================================= */

async function startQuiz(){
  clearInterval(waitingTimer);
  show('quiz');
  await renderQuestion();
}


/* =========================================================
   5 ـ عرض السؤال
   ========================================================= */

function getQuestionText(question) {

  return (
    question.question_text ??
    question.text ??
    question.question ??
    question.title ??
    ''
  );
}


function getQuestionOptions(question) {

  let options =
    question.options ??
    question.answers ??
    question.choices ??
    [];

  if (typeof options === 'string') {

    try {
      options = JSON.parse(options);
    } catch {
      options = [];
    }
  }

  /*
    دعم الأعمدة المنفصلة إن وجدت.
  */

  if (
    (!Array.isArray(options) || options.length === 0) &&
    (
      question.option_a ||
      question.option_b ||
      question.option_c ||
      question.option_d
    )
  ) {

    options = [
      question.option_a,
      question.option_b,
      question.option_c,
      question.option_d
    ].filter(value => value != null);
  }

  return Array.isArray(options)
    ? options
    : [];
}


async function renderQuestion(){
  try{
    const {data,error}=await db.rpc('get_current_question',{p_participant_id:participantId});
    if(error) throw error;
    const r=Array.isArray(data)?data[0]:data;
    if(r?.completed) return finishCompetition();
    const q=r?.question;
    if(!q) throw new Error('تعذر تحميل السؤال.');
    let session=r;
    if(r.needs_start){
      const started=await db.rpc('start_question_session',{p_participant_id:participantId,p_question_id:q.id});
      if(started.error) throw started.error;
      session=Array.isArray(started.data)?started.data[0]:started.data;
    }
    currentQuestion=q;
    const qnum=$('#qnum'),qe=$('#question'),ae=$('#answers');
    if(qnum)qnum.textContent=`السؤال ${q.order||q.question_order}`;
    if(qe)qe.textContent=q.text||q.question_text||'';
    if(ae)ae.innerHTML='';
    [q.option_a,q.option_b,q.option_c,q.option_d].forEach((option,index)=>{
      if(option==null)return;
      const b=document.createElement('button');b.type='button';b.className='answer';b.textContent=String(option);
      b.onclick=()=>submitAnswer(q,index,b);ae?.appendChild(b);
    });
    questionStartedAt=performance.now();
    startServerQuestionCountdown(session.expires_at,q.id);
  }catch(e){console.error('QUESTION ERROR',e);setMessage(e.message||'تعذر تحميل السؤال.',true);}
}
function startServerQuestionCountdown(expiresAt,qid){
  clearInterval(waitingTimer);
  let timer=$('#questionTimer');
  if(!timer){timer=document.createElement('div');timer.id='questionTimer';timer.className='countdown';$('#quiz')?.insertBefore(timer,$('#question'));}
  const tick=()=>{const remain=new Date(expiresAt).getTime()-Date.now();timer.textContent=`${Math.max(0,Math.ceil(remain/1000))} ث`;if(remain<=0){clearInterval(waitingTimer);expireServerQuestion(qid);}};
  tick();waitingTimer=setInterval(tick,100);
}
async function expireServerQuestion(qid){
  if(submitting)return;submitting=true;
  try{const {error}=await db.rpc('expire_question_session',{p_participant_id:participantId,p_question_id:qid});if(error)throw error;submitting=false;await renderQuestion();}
  catch(e){submitting=false;console.error('EXPIRE ERROR',e);}
}


/* =========================================================
   6 ـ إرسال الإجابة
   ========================================================= */

async function submitAnswer(question,selectedIndex,selectedButton){
  if(submitting)return;submitting=true;
  const responseMs=Math.max(0,Math.round(performance.now()-questionStartedAt));
  const buttons=document.querySelectorAll('#answers button');buttons.forEach(b=>b.disabled=true);selectedButton?.classList.add('selected');
  try{
    const {data,error}=await db.rpc('submit_answer',{p_participant_id:participantId,p_question_id:question.id,p_selected_index:selectedIndex,p_response_ms:responseMs});
    if(error)throw error;
    clearInterval(waitingTimer);
    const r=Array.isArray(data)?data[0]:data;
    await new Promise(res=>setTimeout(res,r?.timed_out?150:250));
    submitting=false;await renderQuestion();
  }catch(e){submitting=false;buttons.forEach(b=>b.disabled=false);selectedButton?.classList.remove('selected');alert(e.message||'تعذر تسجيل الإجابة.');}
}


/* =========================================================
   7 ـ نهاية المسابقة
   ========================================================= */

async function finishCompetition(){
  clearInterval(waitingTimer);show('result');
  const score=$('#score'),rankEl=$('#resultRank'),correctEl=$('#resultCorrect'),timeEl=$('#resultTime'),leaderboardEl=$('#leaderboard');
  if(score)score.textContent='جارٍ تجهيز نتيجتك...';if(leaderboardEl)leaderboardEl.innerHTML='';
  try{
    const {data,error}=await db.rpc('get_final_result',{p_participant_id:participantId});if(error)throw error;
    const r=Array.isArray(data)?data[0]:data;
    if(score)score.textContent=`أجبت بشكل صحيح عن ${r?.correct??0} من ${r?.total_questions??0}`;
    if(rankEl)rankEl.textContent=r?.rank?`#${r.rank}`:'—';
    if(correctEl)correctEl.textContent=`${r?.correct??0}/${r?.total_questions??0}`;
    if(timeEl)timeEl.textContent=`${(Number(r?.total_response_ms||0)/1000).toFixed(2)} ث`;
    if(competitionCode&&leaderboardEl){
      const {data:leaders}=await db.rpc('get_competition_leaderboard',{p_code:competitionCode,p_limit:5});
      if(Array.isArray(leaders)&&leaders.length)leaders.forEach(x=>{
        const row=document.createElement('div');row.className='leader-row';
        const rk=document.createElement('span');rk.className='leader-rank';rk.textContent=`#${x.rank}`;
        const id=document.createElement('div');id.className='leader-identity';
        const n=document.createElement('strong');n.textContent=x.full_name||'متسابق';
        const s=document.createElement('small');s.textContent=x.school||'';
        id.append(n,s);const sc=document.createElement('span');sc.className='leader-score';sc.textContent=`${x.correct_answers??0} صحيحة`;
        row.append(rk,id,sc);leaderboardEl.appendChild(row);
      }); else leaderboardEl.textContent='لا توجد نتائج مكتملة حتى الآن.';
    }
  }catch(e){console.error('RESULT ERROR',e);if(score)score.textContent='تم استلام إجاباتك بنجاح ✓';}
}

/* =========================================================
   8 ـ العودة
   ========================================================= */

const againButton = $('#again');

if (againButton) {

  againButton.addEventListener(
    'click',
    () => {

      clearInterval(waitingTimer);

      participantId = null;
      competitionId = null;
      competition = null;
      competitionCode = null;

      questions = [];
      currentQuestion = 0;
      questionStartedAt = 0;
      submitting = false;

      if (joinForm) {
        joinForm.reset();
      }

      setMessage('');

      show('join');
    }
  );
}


/* ---------- البداية ---------- */

show('join');
