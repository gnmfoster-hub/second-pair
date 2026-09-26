-- Answering the enquiries a person did not get to, on time.
--
-- ⚠ THIS ONE IS NOT COPY-AND-PASTE. Two placeholders below have to be filled
-- in before it will do anything — your site's address and your CRON_SECRET.
-- They are deliberately not in the file, because this file is in git.
--
-- ── What went wrong ─────────────────────────────────────────────────────────
--
-- A business set to "when free" holds a customer's message for five minutes to
-- give a person first refusal. The assistant writes a time on the conversation
-- and says nothing. The other half of that bargain — picking it up again when
-- the five minutes are up — ran on GitHub Actions every five minutes, and
-- GitHub's scheduler is best-effort: under load it runs late, or not at all.
--
-- On the morning of 26 September a customer texted Living Canvas at 08:22:
-- "Don't suppose you have any availability this morning an hour or two for a
-- small tattoo?" The hold expired at 08:27. At 09:11 nothing had picked it up
-- and nobody had answered — a real enquiry, about that same morning, sitting
-- unanswered for three quarters of an hour while every part of the system
-- believed it was working.
--
-- The holding worked perfectly. It is the releasing that makes it a feature
-- rather than a way of never replying to anybody, and it was the half resting
-- on somebody else's queue.
--
-- ── Why pg_cron ─────────────────────────────────────────────────────────────
--
-- It runs inside the database. There is no runner to be queued behind, no
-- repository to be throttled, and nothing to go wrong that would not also
-- take the data down with it. Vercel's Hobby plan allows one cron run a day,
-- which is why the daily job is there and the five-minute one never could be.
--
-- Every minute rather than every five, and pointed at `?only=release`, which
-- does the two time-critical things and nothing else. The heavy sweep — the
-- reminders, the tidying, the backup — carries on where it is, unchanged.
--
-- Worst case is now five minutes of hold plus the minute this waits for.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- If this is being run a second time, clear the old job first. Safe when
-- there is none: unschedule throws only when the name is unknown, so it is
-- wrapped rather than guarded.
do $$
begin
  perform cron.unschedule('release-held-conversations');
exception
  when others then null;
end;
$$;

select cron.schedule(
  'release-held-conversations',
  '* * * * *',
  $$
    select net.http_get(
      -- ⚠ REPLACE both of these before running.
      --    The address is your live site. The key is CRON_SECRET, exactly as
      --    it is set in Vercel — the endpoint refuses anything else.
      url := 'https://www.second-pair.com/api/cron/reminders?only=release&key=PUT_YOUR_CRON_SECRET_HERE',
      -- Ten seconds. The release is a small query and a reply or two; if it
      -- has not answered by then the next minute will try again, and a request
      -- left hanging would pile up one a minute.
      timeout_milliseconds := 10000
    );
  $$
);

-- ── Checking it ─────────────────────────────────────────────────────────────
--
-- What is scheduled:
--   select jobid, schedule, active, jobname from cron.job;
--
-- Whether it is actually running, newest first. This is the one to look at if
-- a message is ever slow again — it says whether the job ran, not whether
-- somebody thinks it did:
--   select status, start_time, return_message
--     from cron.job_run_details
--    where jobname = 'release-held-conversations'
--    order by start_time desc
--    limit 10;
--
-- And what it got back. net.http_get returns an id; the reply lands here:
--   select id, status_code, content
--     from net._http_response
--    order by created desc
--    limit 5;
--
-- A 401 means the key does not match CRON_SECRET. A 503 means CRON_SECRET is
-- not set on the deployment at all.
