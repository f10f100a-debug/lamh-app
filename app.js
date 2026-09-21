const SUPABASE_URL = https://qgfuqmturtpglngpmtau.supabase.co
const SUPABASE_KEY = sb_publishable_G3ZOB1cLQmEeyvx4UjdNew_9IMSY2Vc
const $=s=>document.querySelector(s); const screens=['join','waiting','quiz','result'];
const questions=[
 {q:'ما أكبر كواكب المجموعة الشمسية؟',a:['الأرض','المشتري','زحل','المريخ'],ok:1},
 {q:'كم عدد أضلاع الشكل السداسي؟',a:['4','5','6','8'],ok:2},
 {q:'ما عاصمة المملكة العربية السعودية؟',a:['جدة','الرياض','الدمام','أبها'],ok:1}
];
let qi=0, correct=0,totalMs=0,locked=false,tick=null,start=0;
function show(id){screens.forEach(x=>$('#'+x).classList.toggle('hidden',x!==id))}
$('#joinForm').addEventListener('submit',e=>{e.preventDefault();let n=$('#name').value.trim();if(!n)return;$('#hello').textContent=`أهلًا ${n}`;show('waiting');countdown(10)});
function countdown(sec){let end=Date.now()+sec*1000;tick=setInterval(()=>{let d=Math.max(0,end-Date.now());let s=Math.ceil(d/1000);$('#count').textContent=`00:00:${String(s).padStart(2,'0')}`;if(d<=0){clearInterval(tick);qi=0;correct=0;totalMs=0;show('quiz');renderQ()}},50)}
function renderQ(){locked=false;let q=questions[qi];$('#qnum').textContent=`السؤال ${qi+1} من ${questions.length}`;$('#question').textContent=q.q;$('#feedback').textContent='';$('#answers').innerHTML='';q.a.forEach((x,i)=>{let b=document.createElement('button');b.type='button';b.textContent=`${String.fromCharCode(65+i)} — ${x}`;b.addEventListener('click',()=>answer(i,b));$('#answers').appendChild(b)});start=performance.now();clearInterval(tick);tick=setInterval(()=>{let left=Math.max(0,15000-(performance.now()-start));$('#timer').textContent=(left/1000).toFixed(3);if(left<=0){clearInterval(tick);answer(-1,null)}},30)}
function answer(i,b){if(locked)return;locked=true;clearInterval(tick);let ms=Math.min(15000,performance.now()-start);totalMs+=ms;document.querySelectorAll('#answers button').forEach(x=>x.disabled=true);if(b)b.classList.add('selected');let ok=i===questions[qi].ok;if(ok)correct++;$('#feedback').textContent=ok?`إجابة صحيحة ✓ — ${(ms/1000).toFixed(3)} ثانية`:(i<0?'انتهى الوقت':'إجابة غير صحيحة');setTimeout(()=>{qi++;qi<questions.length?renderQ():finish()},900)}
function finish(){show('result');$('#score').textContent=`${correct} إجابات صحيحة من ${questions.length} • الزمن التراكمي ${(totalMs/1000).toFixed(3)} ثانية`;$('#board').innerHTML=`<div><b>نتيجتك</b><span>${correct}/${questions.length}</span></div><div><b>قاعدة الترتيب</b><span>الصحيح ثم الأسرع</span></div><div><b>وضع النسخة</b><span>نموذج تجريبي محلي</span></div>`}
$('#again').addEventListener('click',()=>{clearInterval(tick);show('join')});
