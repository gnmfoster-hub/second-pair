-- Where the customer actually is.
--
-- A contact has had a name, a phone and an email since the beginning and never
-- an address, which is fine for a salon somebody walks into and wrong for every
-- trade that goes to them. The client form asks for it, so there has to be
-- somewhere to put the answer.
--
-- Plain text, because a UK address is whatever somebody writes. Postcode is
-- separate only because it is the half worth searching on.
alter table contacts add column if not exists address text;
alter table contacts add column if not exists postcode text;
