-- Marking an enquiry as what it actually was.
--
-- Some of what arrives is not an enquiry at all: a marketing agency, a list
-- seller, somebody offering search engine optimisation. The assistant catches
-- most of it before anything is written down, and what gets through sits in the
-- inbox looking exactly like work — and worse, counts as work. Every one of
-- them is an enquiry that never booked, so the conversion rate on a business's
-- own report is dragged down by people who were never customers.
--
-- "Lost" is the wrong word for it. Lost means somebody real who went elsewhere,
-- which is a number worth watching; spam is a number worth removing. Putting
-- the two together makes both useless.
--
-- And every one marked is an example. The rules that throw these out were
-- written by reading five emails; a hundred marked by the people actually
-- receiving them is a far better basis, and they cost nothing to collect
-- because the messages are already stored beside the conversation.

alter type conv_status add value if not exists 'spam';
