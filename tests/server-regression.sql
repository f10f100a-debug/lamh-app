-- Synthetic data only. Always rollback; never use a real competition.
BEGIN;
DO $test$
DECLARE c uuid; p uuid; q uuid; q2 uuid; r jsonb; n bigint; rejected boolean; code text := 'REGRESSION-'||gen_random_uuid();
BEGIN
insert into public.competitions(title,slug,start_at,status,seconds_per_question) values('Temporary regression',code,clock_timestamp()+interval '1 hour','waiting',20) returning id into c;
insert into public.participants(competition_id,full_name,mobile,school_name) values(c,'Local regression participant','0500000000','Regression') returning id into p;
insert into public.questions(competition_id,question_order,question_text,option_a,option_b,option_c,option_d,correct_option) values(c,1,'Regression','A','B','C','D','A') returning id into q;
insert into public.questions(competition_id,question_order,question_text,option_a,option_b,option_c,option_d,correct_option) values(c,2,'Expiry','A','B','C','D','A') returning id into q2;
r := public.get_public_competition(code);
if r->>'status'<>'waiting' then raise exception 'future status failed'; end if;
rejected:=false;
begin perform public.start_question_session(p,q); exception when others then rejected:=true; end;
if not rejected then raise exception 'early session accepted'; end if;
update public.competitions set start_at=clock_timestamp()-interval '1 minute' where id=c;
r:=public.get_public_competition(code);
if r->>'status'<>'live' then raise exception 'scheduled live failed'; end if;
perform public.start_question_session(p,q);
r:=public.submit_answer(p,q,0,1);
if r->>'accepted'<>'true' or r->>'is_correct'<>'true' then raise exception 'answer failed'; end if;
perform public.submit_answer(p,q,1,1);
select count(*) into n from public.answers where participant_id=p and question_id=q;
if n<>1 then raise exception 'duplicate answer'; end if;
perform public.start_question_session(p,q2);
update public.question_sessions set started_at=clock_timestamp()-interval '30 seconds',expires_at=clock_timestamp()-interval '10 seconds' where participant_id=p and question_id=q2;
r:=public.expire_question_session(p,q2);
if r->>'expired'<>'true' then raise exception 'expiry failed'; end if;
select answered_count into n from public.leaderboard where participant_id=p;
if n<>2 then raise exception 'leaderboard count failed'; end if;
update public.competitions set status='draft' where id=c;
rejected:=false;
begin perform public.start_question_session(p,q); exception when others then rejected:=true; end;
if not rejected then raise exception 'draft accepted'; end if;
update public.competitions set status='finished' where id=c;
r:=public.get_public_competition(code);
if r->>'status'<>'finished' then raise exception 'finished reopened'; end if;
END;
$test$;
ROLLBACK;
