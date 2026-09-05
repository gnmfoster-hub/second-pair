"use client";

import { useActionState } from "react";
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

export function ArtistEditor({
  artist,
  studioHours,
  styles,
  noun,
  roles,
  isOwner,
  ownLink,
}: {
  artist?: Artist;
  /** Shown as the fallback when this person has no week of their own. */
  studioHours: OpeningHours[];
  styles: ServiceOption[];
  /** What this trade calls them: artist, stylist, engineer. */
  noun: string;
  /** The roles this trade usually has. Suggestions, not a fixed list. */
  /** The person who set the business up. They alone can change it. */
  isOwner?: boolean;
  /** Their own booking link, when they have a handle to build one from. */
  ownLink?: string | null;
  roles: string[];
}) {
  const [state, action] = useActionState<FormState, FormData>(saveArtist, {});
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

          <Field label="Email" hint="Only used to send them their login.">
            <input
              name="email"
              type="email"
              defaultValue={artist?.email ?? ""}
              className="input max-w-sm"
            />
          </Field>

          <Field
            label="What they do"
            hint="Optional. Shown to clients, and it lets the assistant answer &ldquo;who does piercings?&rdquo;"
          >
            <RolePicker suggested={roles} value={artist?.role ?? null} />
          </Field>

          <Field label="Photo" hint="Shown in the diary and to clients. Initials if left blank.">
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

        <div className="grid grid-cols-3 gap-4">
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

        <Field label="Styles" hint="Used to route enquiries to the right person.">
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
          <span className="label">Their own booking link</span>
          <select
            name="agent_scope"
            defaultValue={artist?.agent_scope ?? "only_me"}
            className="input max-w-md"
          >
            <option value="only_me">Books only them</option>
            <option value="me_first">Them first, but can offer others</option>
            <option value="anyone">Can book anybody</option>
          </select>
          <p className="hint mt-1.5">
            Only affects the link with their name on it. The one on your website is set
            under Channels.
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
