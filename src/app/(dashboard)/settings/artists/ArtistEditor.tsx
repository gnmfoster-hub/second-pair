"use client";

import { useActionState, useState } from "react";
import { saveArtist, type FormState } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/Form";
import { penceToInput, formatPence } from "@/lib/money";
import { BookingSource } from "./BookingSource";
import { Avatar } from "@/components/Avatar";
import { OwnHours } from "./OwnHours";
import { LateNights } from "./LateNights";
import { RolePicker } from "./RolePicker";
import type { Artist, OpeningHours, ServiceOption } from "@/lib/types";
import { Snippet } from "../install/Snippet";
import { askAboutRole } from "@/lib/roleQuestion";

export function ArtistEditor({
  artist,
  studioHours,
  styles,
  noun,
  roles,
  isOwner,
  viewerOwns = false,
  ownLink,
  customers = "customers",
}: {
  artist?: Artist;
  /** Shown as the fallback when this person has no week of their own. */
  studioHours: OpeningHours[];
  styles: ServiceOption[];
  /** What this trade calls them: artist, stylist, engineer. */
  noun: string;
  /** The roles this trade usually has. Suggestions, not a fixed list. */
  /** Whether this record belongs to the person who set the business up. */
  isOwner?: boolean;
  /**
   * Whether the person looking is that owner.
   *
   * Not the same question, and conflating them is why "you look after their
   * settings" appeared on the owner's own record — where it means nothing —
   * and never on the records it was written for.
   */
  viewerOwns?: boolean;
  /** Their own booking link, when they have a handle to build one from. */
  ownLink?: string | null;
  /** What this trade calls the people it serves. */
  customers?: string;
  roles: string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveArtist, {});

  /*
   * Whether this row is a bay rather than a body. Held in state so the page
   * stops asking for an email the moment it is ticked, rather than after a
   * save — the whole point of the switch is not being asked for things that
   * cannot exist.
   */
  const [isThing, setIsThing] = useState(artist?.is_resource === true);

  /*
   * The example beside "what they do", in this trade's own words. It was one
   * hardcoded sentence about MOTs, shown to electricians and hairdressers
   * alike. See roleQuestion.
   */
  const asked = askAboutRole(roles, noun);
  const isNew = !artist;

  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
        {artist ? (
          <Avatar person={artist} size="md" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted">
            +
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            {/*
              * "Add someone", not "Add a stylist".
              *
              * The trade word is the studio's, and inside one trade it is often
              * wrong for the person being added: a salon has nail technicians
              * and beauty therapists as well as stylists, a garage has a valeter
              * as well as mechanics. Naming them before they have said what they
              * do is a small thing that tells somebody the software does not
              * quite know their business.
              *
              * What they do is asked two fields down, in their own words, and is
              * shown beside their name from then on.
              */}
            {artist?.name ?? "Add someone"}
            {/* Said beside the name, because the question it answers — who can
                change the prices — is asked while looking at the list. */}
            {isOwner && (
              <span className="ml-2 pill bg-accent/10 text-accent align-middle">Owner</span>
            )}
            {/*
              * Beside the name, where every other fact about them is.
              *
              * It used to sit on its own line under the whole card, right
              * aligned, with nothing near it — so it read as a stray label
              * belonging to whatever came next rather than as a fact about
              * this person.
              */}
            {artist?.user_id && !isOwner && (
              <span
                className="ml-2 pill bg-ok/10 text-ok align-middle"
                title={`${artist.name.split(" ")[0]} can sign in`}
              >
                Has a login
              </span>
            )}
            {artist && !artist.active && (
              <span className="ml-2 text-xs text-muted">(inactive)</span>
            )}
          </div>
          {artist && (
            <div className="hint mt-0.5">
              {/*
                * What they do comes first, before what they cost.
                *
                * The role has been stored for a while and shown nowhere, so a
                * team of five read as five interchangeable rows. It is also the
                * answer to why the heading above no longer guesses.
                */}
              {artist.role ? `${artist.role} · ` : ""}
              {formatPence(artist.hourly_rate_pence)}/hour · minimum{" "}
              {formatPence(artist.min_charge_pence)}
              {artist.calendar_id ? "" : " · no calendar connected"}
            </div>
          )}
        </div>
        <span className="text-xs text-muted group-open:hidden">Edit</span>
      </summary>

      <form action={action} className="space-y-5 border-t border-border p-5">
        {artist && <input type="hidden" name="id" value={artist.id} />}

        {/*
          * Aligned at the top, not the bottom.
          *
          * A field's hint sits under its input, so aligning the row at the
          * bottom lines up the hints and pushes every input that has one
          * upwards. Name has no hint and Email does, which is why those two
          * never sat level. Every label here is a single line, so aligning the
          * tops puts the boxes on the same line and lets the hints hang.
          */}
        <div className="flex flex-wrap items-start gap-5">
          <Field label="Name">
            <input name="name" defaultValue={artist?.name ?? ""} className="input max-w-sm" required />
          </Field>

          {/*
            * A column in the diary is not always a person.
            *
            * A garage books a bay, a hire firm books a room, a driving school
            * books a car. They have hours, they take bookings and they can be
            * busy — and they have no email, no login, no phone to be notified
            * on and no bank account. Everything on this page that assumes a
            * person was being offered for them anyway: a Stripe account only
            * they could connect, an invitation to sign in, a voice of their
            * own in the assistant. Half a screen of things that cannot happen.
            */}
          {!isOwner && (
            <Field label="What this is">
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name="is_resource"
                  checked={isThing}
                  onChange={(e) => setIsThing(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  A place or a thing, not a person
                  <span className="hint block">
                    A bay, a room, a chair, a van. It keeps its own diary and hours and can be
                    booked like anybody else — it just has no login, no phone and no bank
                    account, so none of that is asked for.
                  </span>
                </span>
              </label>
            </Field>
          )}

          {!isThing && (
          <Field label="Email" explain="Only used to send them their login. It is never shown to a customer.">
            <input
              name="email"
              type="email"
              defaultValue={artist?.email ?? ""}
              className="input max-w-sm"
            />
          </Field>
          )}

          <Field
            label="What they do"
            explain={`Optional. Shown to ${customers}${
              asked ? `, and it lets the assistant answer a question like "${asked}"` : ""
            }.`}
          >
            <RolePicker suggested={roles} value={artist?.role ?? null} />
          </Field>

          <Field label="Photo" explain={`Shown in the diary and to ${customers}. Their initials are used if you leave it blank.`}>
            <div className="flex items-center gap-3">
              {artist && <Avatar person={artist} size="lg" />}
              <input
                type="file"
                name="avatar"
                accept="image/jpeg,image/png,image/webp"
                className="text-xs text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:text-foreground"
              />
            </div>
            {artist?.avatar_path && (
              <label className="hint mt-2 flex items-center gap-2">
                <input type="checkbox" name="remove_avatar" value="true" className="accent-[var(--accent)]" />
                Remove the photo
              </label>
            )}
          </Field>
        </div>

        {/*
          * Stacked on a phone, three across from a tablet up.
          *
          * These were three columns at every width, which on a 390px screen
          * is 88 pixels a field — narrow enough that "Hourly rate (£)" broke
          * across two lines and left the "(£)" sitting on its own underneath,
          * and narrow enough that the box you type the number into was barely
          * wider than the number. Found by measuring rather than by eye: the
          * label was inside its box the whole time, the box had just grown a
          * line to hold it.
          */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Hourly rate (£)">
            <input
              name="hourly_rate"
              className="input"
              defaultValue={penceToInput(artist?.hourly_rate_pence)}
              placeholder="120"
              required
            />
          </Field>
          <Field label="Minimum charge (£)">
            <input
              name="min_charge"
              className="input"
              defaultValue={penceToInput(artist?.min_charge_pence)}
              placeholder="80"
              required
            />
          </Field>
          <Field label="Day rate (£)">
            <input
              name="day_rate"
              className="input"
              defaultValue={penceToInput(artist?.day_rate_pence)}
              placeholder="optional"
            />
          </Field>
        </div>

        {/*
          * Whether this person takes money, and which kind.
          *
          * Both switches have existed in the database since payments were
          * built, and the code that decides who may charge a card has read
          * them the whole time. Nothing could set them — so everybody has had
          * the default, and the per-person half of "switches per business and
          * per person" was a pair of values nobody could reach.
          *
          * Two questions rather than one, because they are genuinely
          * different: a tattooist takes a deposit and invoices the rest, a
          * stylist takes the lot on the day and holds nothing. The business
          * has to allow it as well — both switches have to agree — so ticking
          * one here does not override a shop that takes no payments at all.
          */}
        {!isThing && (
        <fieldset className="rounded-xl border border-border p-4">
          <legend className="label px-1">Taking money</legend>
          <input type="hidden" name="touch_money" value="1" />

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="takes_deposits"
              defaultChecked={artist?.takes_deposits !== false}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Can take a deposit
              <span className="hint block">
                For holding an appointment. The business has to be taking them too.
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="takes_payments"
              defaultChecked={artist?.takes_payments !== false}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              Can take the full amount
              <span className="hint block">
                Payment links, and anything charged in full. Separate from deposits,
                because plenty of trades do one and not the other.
              </span>
            </span>
          </label>

          {/*
            * Where their money goes, said rather than left to be discovered.
            *
            * On the per-person model this is the difference between a payment
            * working and being refused, and no switch on this screen can fix
            * it — it is Stripe's own onboarding, with their ID and their bank
            * details.
            */}
          <p className="hint mt-3">
            {artist?.stripe_account_id
              ? "They have their own Stripe account, so their money can go straight to them."
              : `They have no Stripe account of their own yet. Only they can connect it, because Stripe asks for their own ID and bank details: they sign in, open Settings, and on their own tab (the first one, with their name) press Connect my Stripe under Getting paid.${artist?.user_id ? "" : " They need a login first — invite them from this page."}`}
          </p>
        </fieldset>
        )}

        <Field label="Styles" explain="Used to send an enquiry to the right person. Leave them all off and they are considered for everything.">
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {styles.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="styles"
                  value={s.value}
                  defaultChecked={artist?.styles?.includes(s.value)}
                  className="accent-[var(--accent)]"
                />
                {s.label}
              </label>
            ))}
          </div>
        </Field>

        <BookingSource artist={artist} />

        <OwnHours
          hours={artist?.hours ?? null}
          studioHours={studioHours}
          noun={noun}
        />

        {/* Straight after the working week, because it is the exception to it. */}
        <LateNights extra={artist?.extra_hours ?? []} noun={noun} />

        {/*
          * What their own link does.
          *
          * Everybody here can be given a link of their own — on a card, in an
          * Instagram bio — and until now it could only ever book them. That is
          * right for most people and wrong for whoever answers the phone, or
          * for two colleagues who cover each other.
          *
          * Themselves first in every case. Somebody who scanned the code on
          * one person's card is asking for that person, and an assistant that
          * opens by offering somebody else has misread the room.
          */}
        <label className="block">
          <span className="label">On anything of theirs</span>
          <select
            name="agent_scope"
            defaultValue={artist?.agent_scope ?? "only_me"}
            className="input max-w-md"
          >
            <option value="only_me">Books only them</option>
            <option value="me_first">Them first, but can offer others</option>
            <option value="anyone">Can book anybody</option>
          </select>
          {/*
            * It said "only affects the link with their name on it", and that
            * was true: everything else of theirs forced "books only them" and
            * ignored this. So somebody choosing to cover for colleagues got it
            * on their booking page and not on their own number, which is the
            * channel they were picturing when they chose it.
            */}
          <p className="hint mt-1.5">
            Their booking link, their own number, their own Instagram, everything
            that reaches them and nobody else. Books only them unless you change it, which
            is what almost everybody wants: somebody texting {artist?.name?.split(" ")[0] ?? "them"}&rsquo;s
            own number is asking for {artist?.name?.split(" ")[0] ?? "them"}.
          </p>
          <p className="hint mt-1">
            The assistant on your website is separate, and is set under Channels.
          </p>
        </label>

        {/*
          * The link itself, here rather than only under Channels.
          *
          * Channels is the owner's page now, and this is the one thing on it
          * that belongs to the person rather than the business — the address a
          * stylist puts in her own Instagram bio. Hiding the page from her hid
          * her own link with it, which is a thing she needs and nobody else
          * can usefully hand her.
          */}
        {artist && ownLink && (
          <label className="block">
            <span className="label">Their link to share</span>
            <Snippet value={ownLink} />
            <p className="hint mt-1.5">
              For their own Instagram bio, or the bottom of an email. Books them, not
              the shop.
            </p>
            {/*
              * What happens now, before what happens later.
              *
              * This said only "neither is available to anybody yet", which is
              * true and reads as something being broken — Giles turned texts
              * on for the business, came here, and found what looked like a
              * dead channel on every member of the team.
              *
              * The thing it never said is that the team is already reachable.
              * One number belongs to the business and covers everybody on it:
              * somebody texts it, the assistant asks who they would like, and
              * it books the right diary. A number each is an addition to that,
              * not a requirement for it.
              */}
            {/*
              * This said "neither is built yet", and by the afternoon both
              * were. Giles read it three times and concluded each time that
              * there was nowhere to give somebody a channel — which was a fair
              * reading of the only sentence on the subject anywhere near where
              * he was looking.
              *
              * Stale copy is worse than none. It does not merely fail to help,
              * it actively answers the question wrongly, and it keeps doing it
              * long after somebody has done the work.
              */}
            <p className="hint mt-2">
              Texts and calls already reach them on the business&rsquo;s own number — whoever
              writes in is asked who they would like, and it books the right diary.
            </p>
            <p className="hint mt-1.5">
              To give them one of their own, see <strong>Channels of their own</strong> just
              below this. Their own Instagram or Facebook they connect themselves, from their
              own settings, because only they can log in to it.
            </p>
          </label>
        )}

        {/*
          * Their own voice, on their own link.
          *
          * Folded away because it applies to one situation and most businesses
          * are not in it: a shop where each person has their own Instagram, and
          * an enquiry arriving on Sarah's account should sound like Sarah
          * rather than like the salon. Left blank, the shop's own wording is
          * used, which is the right answer for nearly everybody.
          */}
        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm">
            How they sound on their own link
            <span className="hint ml-2">optional</span>
          </summary>

          <div className="space-y-5 border-t border-border p-4">
            <p className="hint">
              Only used when somebody arrives through this person&rsquo;s own link or
              their own Instagram. Everywhere else the {noun} sounds like the
              business.
            </p>

            <Field
              label="What the assistant calls itself for them"
              hint="Blank uses the business's. Somebody answering a stylist's own Instagram is, as far as that client is concerned, her assistant rather than the shop's."
            >
              <input
                name="assistant_name"
                defaultValue={artist?.assistant_name ?? ""}
                className="input max-w-xs"
                maxLength={40}
              />
            </Field>

            {/*
              * The business they trade as, which may not be this one.
              *
              * A chair renter is a business inside a business: she rents the
              * chair, her clients found her rather than the salon, and on her
              * own number the assistant was introducing itself as the salon.
              * The wrong name on the one channel that is definitely hers.
              *
              * Blank is the salon's, which is right for anybody on the payroll
              * and is what everybody starts as.
              */}
            <Field
              label="The business they trade as"
              hint="Blank uses the business's own name, which is right for anybody on the payroll. A chair renter who trades as herself puts it here: Hair by Aisha at Willow & Co."
            >
              <input
                name="trading_name"
                defaultValue={artist?.trading_name ?? ""}
                placeholder={`Hair by ${artist?.name?.split(" ")[0] ?? "Aisha"}`}
                className="input max-w-sm"
                maxLength={60}
              />
            </Field>

            <Field
              label="Their opening line"
              hint="The first thing a client sees. Blank uses the business's."
            >
              <textarea
                name="greeting"
                defaultValue={artist?.greeting ?? ""}
                rows={2}
                placeholder={`Hi, it's ${artist?.name?.split(" ")[0] ?? "Sarah"} — what were you thinking of having done?`}
                className="input"
              />
            </Field>

            <Field
              label="How they write"
              hint="How they greet people, what they never say. Blank uses the business's."
            >
              <textarea
                name="tone"
                defaultValue={artist?.tone ?? ""}
                rows={3}
                placeholder="Warm and quite chatty. Uses first names. Never pushes anyone to book."
                className="input"
              />
            </Field>
          </div>
        </details>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="active"
            defaultChecked={artist?.active ?? true}
            className="accent-[var(--accent)]"
          />
          Taking bookings
        </label>

        {/*
          * Three separate questions that "taking bookings" used to answer at
          * once, and conflating them is why this was first written as an
          * apprentice switch — which is one example of the thing, not the
          * thing.
          *
          * Having a diary is one question: anybody employed here has one, and
          * it can be written into by hand by them or by the owner.
          *
          * Whether the assistant may put customers in it is a second, and it
          * is entirely the owner's preference — an employed person whose work
          * is handed out by the owner, a specialist kept for referrals, a
          * junior being brought on slowly.
          *
          * Whether they have a channel of their own is a third: a link they
          * can send somebody, which reaches them directly and would otherwise
          * go round the first two.
          */}
        {viewerOwns && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="assistant_books"
              defaultChecked={artist?.assistant_books !== false}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              The assistant can offer and book them
              <span className="hint block">
                Your choice, per person. Off, they keep their diary and their hours exactly as
                they are and you or they write into it by hand, a customer is simply
                never offered them. On, the assistant treats them like anybody else.
              </span>
            </span>
          </label>
        )}

        {viewerOwns && !isThing && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="own_link"
              defaultChecked={artist?.own_link !== false}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              They have a booking link of their own
              <span className="hint block">
                A link that reaches them directly, for their own regulars and their own
                Instagram. Off, and there is no way in but through the business, which is
                what employing somebody usually means, and it is why switching the assistant
                off above was not enough on its own.
              </span>
            </span>
          </label>
        )}

        {/*
          * Employed, or renting a chair.
          *
          * Two kinds of person work in the same salon and the product was
          * treating them as one. A chair renter is a business inside a
          * business — her prices, her reminders, her own wording. An employee
          * has a diary and a wage, and everything a customer sees is the
          * shop's.
          *
          * The owner's to set, so it is here rather than on their own page. A
          * person who could switch off being managed is not managed.
          */}
        {viewerOwns && !isOwner && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="owner_managed"
              defaultChecked={artist?.owner_managed ?? false}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              You look after their settings
              <span className="hint block">
                For somebody employed rather than renting a chair. Their prices, hours,
                reminders and wording become yours to set, and they stop being able to
                change them. Their phone and their own calendar stay theirs. Nobody can press a notification button on somebody else&rsquo;s phone.
              </span>
            </span>
          </label>
        )}

        <div className="flex items-center gap-4 pt-1">
          <SubmitButton>{isNew ? "Add them" : "Save"}</SubmitButton>
          <FormMessage state={state} />
          <div className="flex-1" />
          {artist && (
            <button
              type="submit"
              name="intent"
              value="delete"
              formNoValidate
              className="btn-danger"
            >
              Remove
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
