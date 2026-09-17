-- Taking a message, and doing something with it.
--
-- A missed call already becomes a text asking what they need. That works, and
-- it throws away the one thing the caller has already done: said what they
-- wanted. Half of them will not type it out again, and somebody up a ladder at
-- four o'clock is exactly the person who rang rather than typed.
--
-- With this on, the caller can say it, the message is transcribed, handed to
-- the assistant as though it had been texted, and answered by text with a time
-- or a price rather than an invitation to start again. The recording is
-- deleted as soon as it has been read.
--
-- Off by default, and deliberately. It records a member of the public's voice,
-- it costs a few pence a call, and it changes what happens on a phone line two
-- real businesses depend on. Nothing changes for anybody until an owner turns
-- it on.

alter table studios
  add column if not exists voicemail boolean not null default false;

comment on column studios.voicemail is
  'Whether an unanswered call may leave a spoken message for the assistant to answer by text. See src/lib/voice/voicemail.ts.';
