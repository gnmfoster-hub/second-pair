-- The sweep that sends reminders, run more than once a day.
--
-- RUN THIS IN TWO PIECES, in order. Replace the key in the second one first.
--
--
-- What went wrong
-- ---------------
--
-- Samantha's 24 hour reminder for a Monday 11:30 appointment arrived at 08:07
-- on the Monday, saying "See you tomorrow".
--
-- It was not a one-off. Read off the live rows on 19 October, every timed
-- reminder since the 15th was between 20 and 22 hours late, and every one of
-- them was sent at exactly 07:07 UTC:
--
--   due 17 Oct 10:30   sent 18 Oct 07:07   20.6h late
--   due 18 Oct 10:30   sent 19 Oct 07:07   20.6h late
--   due 18 Oct 09:00   sent 19 Oct 07:07   22.1h late
--
-- 07:00 UTC is vercel.json's cron, and the heartbeat file showed the sweep had
-- run twice in 48 hours, 24.00 hours apart. So it was the only thing calling
-- the endpoint: the GitHub Actions workflow that is meant to call it every
-- five minutes was not reaching it at all.
--
-- A reminder therefore became due and then waited for the next 07:07.
-- Confirmations were unaffected, because those are sent as the booking is
-- made rather than by the sweep, which is why nothing looked broken.
--
--
-- Why pg_cron rather than fixing the workflow
-- -------------------------------------------
--
-- Because this is already here and already working. The release job below has
-- been running every minute without missing one: 60 runs in the last hour,
-- all succeeded. It lives next to the data, needs no third party, and cannot
-- be switched off by a repository setting nobody remembers changing.
--
-- Fifteen minutes rather than one. The release is a single small query; the
-- full sweep reads every business and sends. Every part of it claims its work
-- before doing it, so two overlapping runs cannot double send: a reminder
-- moves off `pending` the moment it is picked up, and the daily brief and the
-- weekly report claim the day on the business's own row.


-- 1 of 2. Clear any earlier copy of this job.
-- Wrapped because unschedule throws when the name is unknown, which is the
-- ordinary case the first time this is run.
do $$
begin
  perform cron.unschedule('full-sweep');
exception
  when others then null;
end;
$$;


-- 2 of 2. Every fifteen minutes.
--
-- REPLACE PUT_YOUR_CRON_SECRET_HERE with CRON_SECRET exactly as it is set in
-- Vercel. The endpoint refuses anything else, and refuses silently from here:
-- a wrong key shows up as a job that succeeds and a sweep that never runs.
--
-- Sixty seconds, because this one can have real work in it. If it has not
-- answered by then the next quarter hour tries again.
select cron.schedule(
  'full-sweep',
  '*/15 * * * *',
  $$
    select net.http_get(
      url := 'https://www.second-pair.com/api/cron/reminders?key=PUT_YOUR_CRON_SECRET_HERE',
      timeout_milliseconds := 60000
    );
  $$
);


-- ── Checking it ─────────────────────────────────────────────────────────────
--
-- Both jobs should be listed, both active:
--   select jobid, jobname, schedule, active from cron.job;
--
-- And whether this one is really running, newest first:
--   select d.start_time, d.status
--     from cron.job_run_details d
--     join cron.job j on j.jobid = d.jobid
--    where j.jobname = 'full-sweep'
--    order by d.start_time desc
--    limit 10;
