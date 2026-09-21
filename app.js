const SUPABASE_URL = 'https://qgfuqmturtpgIngpm...supabase.co';
const SUPABASE_KEY = 'ضع_هنا_نفس_sb_publishable_الذي_كان_في_السطر_الثاني';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (s) => document.querySelector(s);

let participantId = null;
let competitionId = null;
let questions = [];
let currentQuestion = 0;
let questionStartedAt = 0;
let timer = null;

/* إظهار شاشة */
function show(id) {
  ['join', 'waiting', 'quiz', 'result'].forEach(screen => {
    const el = $('#' + screen);
    if (el) el.classList.toggle('hidden', screen !== id);
  });
}

/* رسائل للمستخدم */
function message(text) {
  const el = $('#hello');
  if (el) el.textContent = text;
}

/* دخول المسابقة */
$('#joinForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = $('#name')?.value.trim();
  const phone = $('#phone')?.value.trim();
  const school = $('#school')?.value.trim();
  const code = $('#code')?.value.trim().toUpperCase();

  if (!name || !phone || !school || !code) {
    message('يرجى تعبئة الاسم الثلاثي ورقم الجوال والمدرسة ورمز المسابقة.');
    return;
  }

  message('جارٍ التحقق من المسابقة...');

  try {
    const { data, error } = await supabaseClient.rpc(
      'join_competition',
      {
        p_name: name,
        p_phone: phone,
        p_school: school,
        p_code: code
      }
    );

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;

    participantId =
      result?.participant_id ||
      result?.participantId ||
      result?.id;

    competitionId =
      result?.competition_id ||
      result?.competitionId;

    if (!participantId) {
      throw new Error('لم يتم إنشاء تسجيل المتسابق.');
    }

    $('#hello').textContent = `مرحبًا ${name}`;
    show('waiting');

    await loadCompetition();

  } catch (err) {
    console.error(err);
    message(
      err?.message ||
      'تعذر الدخول إلى المسابقة. تأكد من رمز المسابقة والبيانات.'
    );
  }
});

/* تحميل المسابقة */
async function loadCompetition() {

  if (!competitionId) return;

  try {

    const { data: competition, error } = await supabaseClient
      .from('competitions')
      .select('*')
      .eq('id', competitionId)
      .single();

    if (error) throw error;

    const { data: questionData, error: questionError } =
      await supabaseClient
        .from('questions')
        .select('*')
        .eq('competition_id', competitionId)
        .order('question_order', { ascending: true });

    if (questionError) throw questionError;

    questions = questionData || [];

    if (!questions.length) {
      const count = $('#count');
      if (count) count.textContent = 'بانتظار إضافة الأسئلة';
      return;
    }

    const startTime =
      competition.start_at ||
      competition.starts_at ||
      competition.start_time;

    if (!startTime) {
      startQuiz();
      return;
    }

    startWaitingCountdown(new Date(startTime).getTime());

  } catch (err) {
    console.error(err);

    const count = $('#count');
    if (count) {
      count.textContent = 'تعذر تحميل المسابقة';
    }
  }
}

/* العد التنازلي لبداية المسابقة */
function startWaitingCountdown(startTimestamp) {

  clearInterval(timer);

  const update = () => {

    const remaining = startTimestamp - Date.now();

    if (remaining <= 0) {
      clearInterval(timer);
      startQuiz();
      return;
    }

    const totalSeconds = Math.ceil(remaining / 1000);

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const count = $('#count');

    if (count) {
      count.textContent =
        `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
  };

  update();
  timer = setInterval(update, 250);
}

/* بدء الأسئلة */
function startQuiz() {

  currentQuestion = 0;

  show('quiz');

  renderQuestion();
}

/* عرض السؤال */
function renderQuestion() {

  const question = questions[currentQuestion];

  if (!question) {
    finishCompetition();
    return;
  }

  const qnum = $('#qnum');
  const questionEl = $('#question');
  const answersEl = $('#answers');

  if (qnum) {
    qnum.textContent =
      `السؤال ${currentQuestion + 1} من ${questions.length}`;
  }

  if (questionEl) {
    questionEl.textContent =
      question.question_text ||
      question.text ||
      question.question ||
      '';
  }

  if (!answersEl) return;

  answersEl.innerHTML = '';

  let answers =
    question.options ||
    question.answers ||
    [];

  if (typeof answers === 'string') {
    try {
      answers = JSON.parse(answers);
    } catch {
      answers = [];
    }
  }

  answers.forEach((answer, index) => {

    const button = document.createElement('button');

    button.type = 'button';
    button.className = 'answer';

    button.textContent =
      typeof answer === 'object'
        ? answer.text
        : answer;

    button.addEventListener('click', () => {
      submitAnswer(question, index, button);
    });

    answersEl.appendChild(button);
  });

  questionStartedAt = performance.now();
}

/* إرسال الإجابة */
async function submitAnswer(question, answerIndex, button) {

  const buttons = document.querySelectorAll('#answers button');

  buttons.forEach(btn => btn.disabled = true);

  const clientElapsedMs =
    Math.round(performance.now() - questionStartedAt);

  button.classList.add('selected');

  try {

    const { data, error } = await supabaseClient.rpc(
      'submit_answer',
      {
        p_participant_id: participantId,
        p_question_id: question.id,
        p_answer_index: answerIndex
      }
    );

    if (error) throw error;

    console.log(
      'Answer accepted',
      data,
      clientElapsedMs
    );

    setTimeout(() => {

      currentQuestion++;

      if (currentQuestion >= questions.length) {
        finishCompetition();
      } else {
        renderQuestion();
      }

    }, 500);

  } catch (err) {

    console.error(err);

    alert(
      err?.message ||
      'حدث خطأ أثناء تسجيل الإجابة.'
    );

    buttons.forEach(btn => btn.disabled = false);
  }
}

/* إنهاء المسابقة */
async function finishCompetition() {

  clearInterval(timer);

  show('result');

  const score = $('#score');

  if (score) {
    score.textContent =
      'تم استلام إجاباتك بنجاح ✓';
  }

  try {

    const { data, error } = await supabaseClient
      .from('leaderboard')
      .select('*')
      .eq('competition_id', competitionId);

    if (!error && data) {
      console.log('Leaderboard:', data);
    }

  } catch (err) {
    console.error(err);
  }
}

/* إعادة الشاشة الرئيسية */
$('#again')?.addEventListener('click', () => {

  clearInterval(timer);

  participantId = null;
  competitionId = null;
  questions = [];
  currentQuestion = 0;

  show('join');
});
