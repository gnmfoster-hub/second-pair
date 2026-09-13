-- What happens when somebody has not connected their own Stripe yet.
--
-- On the per-person model the money is meant to go to the person who did the
-- work. Somebody who has not finished Stripe's onboarding has nowhere for it to
-- go, and there are only two honest answers: refuse the payment, or send it to
-- the business.
--
-- Both are wrong as a silent default. Refusing quietly blocks a booking nobody
-- can explain. Falling back quietly puts a chair renter's money in the
-- owner's account, which is the exact thing the per-person model exists to
-- prevent — and the owner then owes somebody money they never agreed to hold.
--
-- So it is a decision the owner makes out loud, and off until they make it.
alter table studios
  add column if not exists payment_fallback boolean not null default false;

comment on column studios.payment_fallback is
  'Per-person model only. True sends a payment to the business when that person has no Stripe account of their own; false refuses it and says why. Off by default, because money arriving somewhere nobody chose is worse than a payment that plainly did not happen.';
