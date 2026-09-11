import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { startOfWeek, addDays, isoDate, parseIsoDate } from "@/lib/calendar";
import { WeekGrid, type Entry } from "./WeekGrid";
import { MonthGrid } from "./MonthGrid";
import { DayList } from "./DayList";
import { SwipeDays } from "./SwipeDays";
import { WeekStrip, type DayLoad } from "./WeekStrip";
import { Stepper } from "./Stepper";
import { WhoPicker } from "./WhoPicker";
import { UpNext } from "@/components/UpNext";
import { Shortcuts } from "./Shortcuts";
import { NewEntry } from "./NewEntry";
import { ColourBy } from "./ColourBy";
import { colourForName, type ColourMode } from "@/lib/diaryColour";
import { formatPence } from "@/lib/money";
import { dayShape, weekShape, minutesInDay } from "@/lib/diaryGaps";
import { cookies } from "next/headers";
import {
  DIARY_LAYOUT_COOKIE,
  readDiaryLayout,
  diaryPanes,
} from "@/lib/diaryLayout";
import { LayoutToggle } from "./LayoutToggle";

/** Sunday first, matching getUTCDay(). Single letters — the strips are 24px. */
const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

type RawRow = {
  id: string;
  artist_id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  category: string;
  blocks_availability: boolean;
  source: "assistant" | "manual" | "block";
  title: string | null;
  notes: string | null;
  deposit_status: string;
  deposit_amount_pence: number;
  price_pence: number | null;
  repeats: string;
  contacts: { id: string; name: string | null; phone: string | null } | null;
  enquiries: {
    description: string | null;
    quote_low_pence: number | null;
    conversation_id: string;
    conversations: {
      contacts: { name: string | null; phone: string | null } | null;
    } | null;
  } | null;
};

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string; day?: string; who?: string }>;
}) {
  const { week, view: viewParam, day: dayParam, who } = await searchParams;
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const artists = await getArtists(studio.id);
  const team = artists.filter((a) => a.active);

  // With more than one person, the day — everyone side by side — is the view a
  // shop actually works from. On your own, the week is more useful.
  /*
   * Which view, and why it kept snapping back.
   *
   * This used to read: day if asked for, or if there is a team and nothing was
   * asked for. But the Week button links to ?week=<date> with no view
   * parameter — so on any diary with more than one person, clicking Week fell
   * straight through to "nothing was asked for" and went back to Day. Week
   * view was unreachable for a salon, which is the one place it earns its
   * keep.
   *
   * Now an explicit choice always wins, a ?week= is itself a choice, and
   * everything else opens on the day.
   *
   * It used to open a one-person business on the week, on the grounds that a
   * single column of one day is a sparse thing to look at. That was reasoning
   * about the grid, and on a phone the day is a list now — where one person's
   * day is exactly the right amount of information and a week is seven columns
   * of forty-five pixels.
   *
   * The alternative, tried and thrown away, was to keep the week and quietly
   * show the day on narrow screens. It worked and it read as broken: the
   * heading said "7 Sept – 13 Sept", the figures gave the week's hours and
   * takings, and Week was lit up in the switcher, all above a list of one
   * Friday. Every one of those would have needed its own mobile variant to
   * agree with the thing underneath it. Opening on the day makes all of them
   * true without any of that.
   */
  const view: "day" | "week" | "month" =
    viewParam === "day"
      ? "day"
      : viewParam === "month"
        ? "month"
        : viewParam === "week" || week
          ? "week"
          : "day";

  /*
   * Whether the week was chosen or merely defaulted to.
   *
   * A business with one person lands on the week, which is right at a desk —
   * a solo tattooist books six weeks out and wants to see the shape of them.
   * On a phone it is the worst view in the product: seven columns across
   * 390px is 45 pixels each, and both of the businesses running this today
   * have exactly one person, so this is the screen they actually get.
   *
   * Rather than change the default and take the week away from anybody at a
   * desk, a phone is given the day and a wider screen the week, and the choice
   * is undone the moment somebody presses a view button for themselves.
   */
  const focusDay = dayParam ? parseIsoDate(dayParam) : new Date();
  const anchor = week ? parseIsoDate(week) : focusDay;
  /*
   * A month is shown as whole weeks, so the grid is rectangular and the days
   * either side belong to the neighbouring months rather than being blanks.
   */
  const monthAnchor = new Date(
    Date.UTC(anchor.getFullYear(), anchor.getMonth(), 1, 12),
  );
  const monthStart = startOfWeek(monthAnchor);
  const monthEnd = (() => {
    const last = new Date(
      Date.UTC(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12),
    );
    return addDays(startOfWeek(last), 7);
  })();

  /*
   * List or columns, if anybody has said.
   *
   * Not in the URL: see lib/diaryLayout. Absent, the width decides exactly as
   * it did before this existed — a phone gets the list, a desk gets the grid —
   * so nobody who has never touched it sees any change.
   */
  const layout = readDiaryLayout((await cookies()).get(DIARY_LAYOUT_COOKIE)?.value);
  // Day only — see diaryPanes, which carries the reason and the test.
  const panes = diaryPanes(view, layout);

  const start =
    view === "day" ? focusDay : view === "month" ? monthStart : startOfWeek(anchor);
  const end =
    view === "day" ? addDays(focusDay, 1) : view === "month" ? monthEnd : addDays(start, 7);

  // A little either side, so a multi-day holiday starting last week still shows.
  const { data } = await supabase
    .from("bookings")
    .select(
      "id, artist_id, starts_at, ends_at, all_day, category, blocks_availability, source, " +
        "title, notes, deposit_status, deposit_amount_pence, price_pence, repeats, " +
        "contacts(id, name, phone), " +
        "enquiries(description, quote_low_pence, conversation_id, conversations(contacts(name, phone)))",
    )
    .is("cancelled_at", null)
    .lt("starts_at", addDays(end, 1).toISOString())
    .gt("ends_at", addDays(start, -1).toISOString())
    .order("starts_at");

  /*
   * How busy each day of this week is, for the strip across the top of a
   * phone.
   *
   * Its own query, and a deliberately thin one — starts, ends and whose it is,
   * nothing else. The main query above fetches one day in day view, which is
   * right for drawing that day and useless for saying anything about Thursday.
   *
   * Only for the day view, because only the day view has a strip. The week and
   * month already show the week.
   */
  const weekLoad: { starts_at: string; ends_at: string; artist_id: string }[] =
    view === "day"
      ? ((
          await supabase
            .from("bookings")
            .select("starts_at, ends_at, artist_id")
            .is("cancelled_at", null)
            .eq("blocks_availability", true)
            .gte("starts_at", startOfWeek(focusDay).toISOString())
            .lt("starts_at", addDays(startOfWeek(focusDay), 7).toISOString())
        ).data ?? [])
      : [];

  const focused = who && team.some((a) => a.id === who) ? who : null;
  const mine = new Set(
    (focused ? team.filter((a) => a.id === focused) : artists).map((a) => a.id),
  );
  const entries: Entry[] = ((data ?? []) as unknown as RawRow[])
    .filter((r) => mine.has(r.artist_id))
    .map((r) => ({
      id: r.id,
      artist_id: r.artist_id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      all_day: r.all_day,
      category: r.category,
      blocks_availability: r.blocks_availability,
      source: r.source,
      title: r.title,
      notes: r.notes,
      deposit_status: r.deposit_status,
      deposit_amount_pence: r.deposit_amount_pence,
      price_pence: r.price_pence,
      // Either route: a conversation's contact, or one attached by hand.
      clientName: r.enquiries?.conversations?.contacts?.name ?? r.contacts?.name ?? null,
      clientPhone: r.enquiries?.conversations?.contacts?.phone ?? r.contacts?.phone ?? null,
      contactId: r.contacts?.id ?? null,
      description: r.enquiries?.description ?? null,
      conversationId: r.enquiries?.conversation_id ?? null,
      quotePence: r.enquiries?.quote_low_pence ?? null,
      repeats: r.repeats,
    }));

  const label =
    view === "day"
      ? focusDay.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : view === "month"
        ? anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(
            start,
            6,
          ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const monthWeeks: string[][] = [];
  for (let cursor = new Date(monthStart); cursor < monthEnd; cursor = addDays(cursor, 7)) {
    monthWeeks.push(Array.from({ length: 7 }, (_, i) => isoDate(addDays(cursor, i))));
  }

  const step = view === "day" ? 1 : 7;

  /*
   * A day either way, whatever the view thinks it is.
   *
   * The swipe moves the list on a phone, and the list is always one day — but
   * a business with one person defaults to the week view, whose arrows step
   * seven days at a time. Handing those to the swipe would have a flick of the
   * thumb jump a week, which is not what pushing today sideways means anywhere
   * else on a phone.
   */
  const dayBack = `/diary?view=day&day=${isoDate(addDays(focusDay, -1))}`;
  const dayForward = `/diary?view=day&day=${isoDate(addDays(focusDay, 1))}`;

  // A month steps by a month, not by four weeks, or the label drifts.
  const shiftMonth = (by: number) =>
    isoDate(new Date(Date.UTC(anchor.getFullYear(), anchor.getMonth() + by, 1, 12)));

  const back =
    view === "day"
      ? `/diary?view=day&day=${isoDate(addDays(focusDay, -step))}`
      : view === "month"
        ? `/diary?view=month&week=${shiftMonth(-1)}`
        : `/diary?view=week&week=${isoDate(addDays(start, -step))}`;
  const forward =
    view === "day"
      ? `/diary?view=day&day=${isoDate(addDays(focusDay, step))}`
      : view === "month"
        ? `/diary?view=month&week=${shiftMonth(1)}`
        : `/diary?view=week&week=${isoDate(addDays(start, step))}`;

  const awaiting = entries.filter(
    (e) => e.deposit_amount_pence > 0 && e.deposit_status !== "paid",
  ).length;

  /*
   * What the period is worth.
   *
   * A one-person business looking at their week wants three numbers: how much
   * of it is spoken for, what it earns, and how much room is left. The last
   * one is the reason to look — it is the answer to "can I fit this job in?"
   */
  /*
   * However many days are actually on screen.
   *
   * This counted seven whatever you were looking at, so a month's bookings were
   * being measured against a week's capacity — a figure that was quietly four
   * or five times too full and looked plausible enough not to notice.
   */
  const daysInView =
    view === "day" ? 1 : view === "month" ? monthWeeks.length * 7 : 7;

  const workingMinutes = Array.from({ length: daysInView }, (_, i) => {
    const d = addDays(view === "day" ? focusDay : start, i);
    const h = studio.hours.find((x) => x.day === d.getDay());
    if (!h || h.closed) return 0;
    const from = Number(h.open.slice(0, 2)) * 60 + Number(h.open.slice(3, 5));
    const to = Number(h.close.slice(0, 2)) * 60 + Number(h.close.slice(3, 5));
    return Math.max(0, to - from);
  }).reduce((a, b) => a + b, 0);

  const bookedMinutes = entries
    .filter((e) => e.blocks_availability && !e.all_day)
    .reduce(
      (total, e) => total + (Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60000,
      0,
    );

  /*
   * What was agreed, then what was quoted.
   *
   * It used to be the quote alone, which is only ever set on work the
   * assistant booked. A shop that types its own regulars in saw £0 every week
   * and quite reasonably stopped believing the number.
   */
  const worth = entries.reduce(
    (total, e) => total + (e.price_pence ?? e.quotePence ?? 0),
    0,
  );

  // Multiple people multiply the room available, so the figure means something
  // in a salon as well as in a van.
  const capacity = workingMinutes * Math.max(1, focused ? 1 : team.length);

  /*
   * The shape of the day, for the strip in the bar.
   *
   * Day view only. Across a week it would average seven days into one line and
   * describe none of them, which is worse than the percentage it replaces.
   *
   * Minutes rather than pixels here — dayShape only cares that the unit is
   * consistent, and the page has no business knowing how tall an hour is drawn.
   */
  const shape =
    view === "day"
      ? dayShape(
          entries
            .filter((e) => e.blocks_availability !== false)
            .map((e) => ({
              top: minutesInDay(e.starts_at, studio.timezone),
              height: Math.max(
                0,
                (Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 60_000,
              ),
            })),
          studio.hours.find((h) => h.day === focusDay.getDay()),
          60,
        )
      : [];
  /*
   * The same idea across a week: seven shapes rather than one average.
   *
   * A week cannot be one strip — it would say "34% full" in a different shape,
   * and the question at this range is never how full the week is, it is which
   * day has room in it. Monday solid and Thursday empty is a completely
   * different week from five half-full days, and both are fifty per cent.
   */
  const weekBars =
    view === "week"
      ? weekShape(
          entries
            .filter((e) => e.blocks_availability !== false)
            .map((e) => ({ startsAt: e.starts_at, endsAt: e.ends_at })),
          Array.from({ length: 7 }, (_, i) => isoDate(addDays(start, i))),
          studio.hours,
          studio.timezone,
          Math.max(1, focused ? 1 : team.length),
        )
      : [];

  /*
   * Whether this particular day has anything on it.
   *
   * The same overlap rule the list uses, because the two must agree: the list
   * deciding it is empty while the page thinks otherwise would put "up next"
   * above a day full of appointments.
   */
  const onThisDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: studio.timezone }).format(new Date(iso));
  const dayKey = isoDate(focusDay);
  const todayIsEmpty = !entries.some(
    (e) => onThisDay(e.starts_at) <= dayKey && onThisDay(e.ends_at) >= dayKey,
  );

  const freeMinutes = Math.max(0, capacity - bookedMinutes);

  /*
   * Each day of the week as a fraction of itself.
   *
   * Against that day's own opening hours and its own number of people, so a
   * Saturday that is open four hours is not shown as quiet simply for being
   * short. A day the business is shut is marked closed rather than empty —
   * an empty track on a Sunday reads as "wide open", which is the opposite of
   * what it means.
   */
  const strip: DayLoad[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(startOfWeek(focusDay), i);
    const key = isoDate(day);
    const opening = studio.hours.find((h) => h.day === day.getDay());
    const openMinutes =
      opening && !opening.closed
        ? Math.max(
            0,
            Number(opening.close.split(":")[0]) * 60 +
              Number(opening.close.split(":")[1]) -
              (Number(opening.open.split(":")[0]) * 60 + Number(opening.open.split(":")[1])),
          )
        : 0;

    const people = Math.max(1, focused ? 1 : team.length);
    const room = openMinutes * people;

    const busy = weekLoad
      .filter((b) => (focused ? b.artist_id === focused : mine.has(b.artist_id)))
      .filter((b) => isoDate(new Date(b.starts_at)) === key)
      .reduce(
        (total, b) =>
          total + Math.max(0, (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60_000),
        0,
      );

    return { date: key, open: room > 0, full: room > 0 ? busy / room : 0 };
  });
  const asHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        {/*
          * The word "Diary" is worth fifty pixels on a phone and says nothing.
          *
          * The tab at the bottom of the screen already reads Diary and is lit
          * up; repeating it above the date is a heading telling somebody where
          * they just tapped. The date is the useful half and it stands on its
          * own, bigger, where the title was.
          */}
        <h1 className="page-title hidden sm:block">Diary</h1>
        <span className="text-base font-medium sm:hint sm:text-sm sm:font-normal">{label}</span>
        {/*
          * The day's figures, on the date's own line, on a phone only.
          *
          * They had a strip of their own inside the card — a whole row, a
          * border and its padding, thirty-five pixels to say two numbers that
          * fit comfortably on the end of the line above. The strip earns its
          * place on a desktop where it carries a fourth figure and the shape of
          * the day; on a phone it was furniture.
          */}
        {bookedMinutes > 0 && (
          <span className="hint text-xs tabular-nums sm:hidden">
            {asHours(bookedMinutes)} &middot; {formatPence(worth)}
          </span>
        )}

        {/*
          * The arrows, beside the date they move, on a phone.
          *
          * Day view has the week strip instead, which does the same job and
          * answers "is Thursday full" as well.
          */}
        {view !== "day" && (
          <Stepper
            back={back}
            forward={forward}
            today={`/diary?view=${view}`}
            className="ml-auto flex sm:hidden"
          />
        )}
        {awaiting > 0 && (
          <span className="rounded-full bg-warn/10 px-2.5 py-1 text-xs text-warn">
            {awaiting} waiting on a deposit
          </span>
        )}

        {/*
         * Wraps, or the phone scrolls sideways.
         *
         * Six controls — three views, back, today, forward, the colour
         * picker, the shortcuts key and Add — sat in one row that could not
         * break. On a 390px screen that was a hundred and nine pixels of
         * overflow: Add was off the edge of the display, and the whole page
         * slid left and right under the thumb, which on the screen an owner
         * opens twenty times a day is the worst place for it.
         */}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {/* One segmented control rather than five loose buttons: the view and
              the date are the same decision, and they belong together. */}
          <div className="flex overflow-hidden rounded-xl border border-border bg-surface">
            <Link
              href={`/diary?view=day&day=${isoDate(focusDay)}`}
              className={`px-3 py-1.5 text-sm font-medium transition-colors sm:px-3.5 sm:py-2 ${
                view === "day"
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Day
            </Link>
            <Link
              href={`/diary?view=week&week=${isoDate(view === "month" ? focusDay : start)}`}
              className={`border-l border-border px-3 py-1.5 text-sm font-medium transition-colors sm:px-3.5 sm:py-2 ${
                view === "week"
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Week
            </Link>
            {/*
             * The question day and week cannot answer: how does October look.
             * A tattooist books six weeks out and an owner wants to see which
             * weeks are thin before deciding to run an offer.
             */}
            <Link
              href={`/diary?view=month&week=${isoDate(anchor)}`}
              className={`border-l border-border px-3 py-1.5 text-sm font-medium transition-colors sm:px-3.5 sm:py-2 ${
                view === "month"
                  ? "bg-surface-2 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Month
            </Link>
          </div>

          {/*
            * List or columns — a second control, and a different question.
            *
            * Day, week and month are how much time is on screen. This is what
            * shape it is in, and the two are independent: a week can be read
            * as an agenda and a day as columns. Kept as its own segmented
            * control beside the first rather than added to it as a fourth
            * button, because "Month" and "Columns" are not alternatives to
            * each other and a control that implies they are would be a lie
            * about how the diary works.
            *
            * Day only, because a day is the only view whose columns are
            * people. A week's columns are the seven days — comparing days is
            * what a week is for — so offering it there promised a thing it
            * could not do: the sideways scroll ran Monday to Sunday while the
            * person doing it was looking for a stylist.
            *
            * Not for a solo diary either. The grid's column-per-person is one
            * column there, so the choice would decide nothing while taking
            * room on a phone toolbar that has twice had to be rescued from
            * pushing Add onto a line of its own. Both businesses running this
            * today are solo: for them, nothing here changes at all.
            */}
          {view === "day" && team.length > 1 && <LayoutToggle current={layout} />}

          {/*
            * The stepper, on anything but a phone in day view.
            *
            * The week strip below replaces it there and does more: two arrows
            * and a Today button move one day at a time and say nothing about
            * any other, while seven dates with a bar under each answer "is
            * Thursday full" without touching anything.
            */}
          {/*
            * With the other controls at every size but a phone, where it has
            * gone up beside the date — the three rows would not fit on one
            * otherwise. Never in day view on a phone, where the week strip
            * replaces it and does more.
            */}
          <Stepper
            back={back}
            forward={forward}
            today={`/diary?view=${view}`}
            className={view === "day" ? "hidden sm:flex" : "hidden sm:flex"}
          />

          <ColourBy
            current={(studio.diary_colour ?? "category") as ColourMode}
            hasTeam={team.length > 1}
          />

          <Shortcuts
            back={back}
            forward={forward}
            today={`/diary?view=${view}`}
            dayHref={`/diary?view=day&day=${isoDate(focusDay)}`}
            weekHref={`/diary?view=week&week=${isoDate(start)}`}
          />

          {/*
           * The only way to add anything used to be clicking the grid, which
           * nobody finds on their own. Amber, because the pack allows one call
           * to action per screen and on this page it is obviously this.
           */}
          <NewEntry artists={team} timezone={studio.timezone} />
        </div>
      </div>

      {/*
       * What this period is worth, and how much room is left.
       *
       * One line rather than three cards: the diary is what people came for,
       * and a row of large mostly-empty boxes pushed it below the fold. The
       * bar reads the same at a glance and costs a tenth of the space.
       */}
      {/*
       * The summary and the grid are one card, not two boxes.
       *
       * Stacked separately they read as two unrelated panels with a gap
       * between them; joined, the figures are plainly a caption for the week
       * underneath, which is what they are.
       */}
      {/*
        * The grid arrives rather than appearing.
        *
        * The front page has done this since the design pass and the diary never
        * did, which is backwards: this is the screen an owner opens twenty times
        * a day, and it was the one that snapped into place like a table being
        * printed. One beat, and it stops for anybody who has asked for less
        * motion.
        */}
      {/*
        * No frame around a list.
        *
        * The card is what holds the grid together — a border, a background and
        * the figures along the top. Around a list of rows that already have
        * their own borders it is a box inside a box, costing a border, its
        * padding and the horizontal room besides, for nothing anybody can see.
        * Kept at every other size, where it holds the grid it was built for.
        */}
      <div
        className={`settle relative mt-3 overflow-hidden sm:mt-5 sm:rounded-2xl sm:border sm:border-border sm:bg-surface sm:shadow-[var(--shadow-card)] ${
          view !== "month" ? "" : "card"
        }`}
      >
      {/*
        * One line on a phone, whatever it takes.
        *
        * Wrapping was the right call for a desktop and cost ninety pixels on a
        * 390px screen — three figures and a bar became three stacked rows,
        * pushing the actual diary a third of the way down a screen that had
        * four and three quarter hours of it to show. The figures are a caption;
        * a caption that takes a tenth of the screen is not one.
        */}
      <div className="hidden items-center gap-x-4 overflow-x-auto whitespace-nowrap border-b border-border px-4 py-2 text-xs sm:flex sm:flex-wrap sm:gap-x-6 sm:py-2.5 sm:text-sm">
        <Figure label="booked" value={asHours(bookedMinutes)} />
        <Figure label="worth" value={formatPence(worth)} accent={worth > 0} />
        {/*
          * "0h free" is a lie when nobody has said when they are open.
          *
          * It reads as "you are fully booked" to somebody whose diary is
          * completely empty — the opposite of the truth, on the day they are
          * setting the business up.
          */}
        {/*
          * Two figures fit a phone; three do not.
          *
          * With all three the line overflowed by twenty-four pixels and grew a
          * sideways scrollbar under a caption, which looks like a fault. Booked
          * and worth are what somebody checks on a phone between appointments;
          * how much room is left is a question asked while planning, at a desk,
          * where all three still show.
          */}
        <span className="hidden sm:contents">
          <Figure label="free" value={capacity > 0 ? asHours(freeMinutes) : "—"} />
        </span>

        {capacity > 0 ? (
          <div className="ml-auto hidden items-center gap-2.5 sm:flex">
            {/*
              * The shape of the day, where the percentage used to be.
              *
              * "6% full" is true and answers nothing. Solid all morning and
              * empty after two is a completely different day from four jobs
              * scattered through it, and both are the same percentage. This is
              * the same width and says which one you have got.
              *
              * Only in the day view: seven days averaged into one strip would
              * be a shape of nothing.
              */}
            {shape.length > 0 ? (
              <div
                className="flex h-2 w-32 overflow-hidden rounded-full bg-surface-2"
                title="Where the day is booked"
              >
                {shape.map((run) => (
                  <div
                    key={run.from}
                    className={run.busy ? "bg-accent" : ""}
                    style={{ width: `${run.to - run.from}%` }}
                  />
                ))}
              </div>
            ) : weekBars.length > 0 ? (
              /*
                * One strip per day, in the week's own order.
                *
                * Read left to right it is the week at a glance: which days are
                * solid, which have an afternoon going spare, which are shut.
                * That is the thing somebody is looking for when they have got
                * a customer asking to be fitted in.
                */
              <div className="flex items-end gap-1" title="Where each day is booked">
                {weekBars.map((d) => (
                  <div key={d.iso} className="flex w-6 flex-col items-center gap-1">
                    <div className="flex h-6 w-full flex-col-reverse overflow-hidden rounded bg-surface-2">
                      {d.shape.length === 0 ? null : (
                        <div
                          className="w-full bg-accent"
                          style={{ height: `${d.busyPercent}%` }}
                        />
                      )}
                    </div>
                    <span className="text-[10px] leading-none text-muted">
                      {DAY_INITIALS[new Date(`${d.iso}T12:00:00Z`).getUTCDay()]}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.min(100, Math.round((bookedMinutes / capacity) * 100))}%`,
                  }}
                />
              </div>
            )}
            {weekBars.length === 0 && (
              <span className="hint num">
                {Math.round((bookedMinutes / capacity) * 100)}% full
              </span>
            )}
          </div>
        ) : (
          <Link href="/settings" className="ml-auto text-xs text-warn hover:underline">
            No opening hours set — add them
          </Link>
        )}
      </div>

      {view === "day" && (
        <WeekStrip focusDay={focusDay} load={strip} who={focused} today={isoDate(new Date())} />
      )}

      {/*
        * Chips for a handful of people, a picker for a salon.
        *
        * A row of chips is the right control for three or four: every name on
        * the screen, one tap to any of them, nothing to learn. Measured on a
        * five-chair salon at 360px it stops being that — the row runs off the
        * side, Chloe is clipped and Jade is not on the screen at all, behind a
        * sideways scroll nobody is told about.
        *
        * Five is where it turns over. One tap becomes two, which is the right
        * trade against a name you cannot find. Wider screens keep the chips at
        * any size, because there they wrap onto a second line and stay whole.
        */}
      {team.length > 4 && (
        <div data-no-swipe className="mt-3 sm:hidden">
          <WhoPicker
            team={team}
            focused={focused}
            colourByPerson={(studio.diary_colour ?? "category") === "person"}
            view={view === "month" ? "week" : view}
            anchor={view === "day" ? isoDate(focusDay) : isoDate(start)}
          />
        </div>
      )}

      {team.length > 1 && (
        <div
          data-no-swipe
          className={`mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:mt-4 sm:flex-wrap sm:overflow-visible ${
            team.length > 4 ? "hidden sm:flex" : ""
          }`}
        >
          <Link
            href={
              view === "day"
                ? `/diary?view=day&day=${isoDate(focusDay)}`
                : `/diary?view=week&week=${isoDate(start)}`
            }
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              !focused ? "bg-surface-2 text-foreground" : "border border-border text-muted hover:text-foreground"
            }`}
          >
            Everyone
          </Link>
          {team.map((a) => (
            <Link
              key={a.id}
              href={
                view === "day"
                  ? `/diary?view=day&day=${isoDate(focusDay)}&who=${a.id}`
                  : `/diary?view=week&week=${isoDate(start)}&who=${a.id}`
              }
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors ${
                focused === a.id
                  ? "bg-surface-2 text-foreground"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {/*
               * The chips are the key.
               *
               * Cards are coloured by person, and nothing anywhere said which
               * colour was whose — so a four-chair salon read as pretty
               * confetti. A dot on the name each person already has costs no
               * space and answers it, without a legend to put somewhere.
               *
               * Only when the colour actually means the person; by client or by
               * category a dot here would be a lie.
               */}
              {(studio.diary_colour ?? "category") === "person" && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: a.colour || colourForName(a.name) }}
                  aria-hidden
                />
              )}
              {a.name}
            </Link>
          ))}
        </div>
      )}

      {/*
       * The instructions used to sit here as a paragraph above the diary,
       * where they were read once and then got in the way every day
       * afterwards. They live under the ? key now, with the shortcuts.
       */}

      {/*
        * What an empty diary should say.
        *
        * It said nothing at all: a new business opened the screen it will spend
        * its day in and got a grey grid, two names, and a small orange line in
        * the far corner — which was the only thing on the page that mattered,
        * because without opening hours the assistant cannot offer a time and
        * nothing can ever be booked.
        *
        * Two different silences, so two different answers. No hours is a
        * blocked product and says so. An empty day is just a quiet day, and the
        * only useful thing to say is how to put something in it — which was
        * documented under the ? key, where nobody looks on their first morning.
        */}
      {/*
        * Above the clock, and only where there is a grid to be empty.
        *
        * Two faults in one box. It sat at z-10, which is exactly what the
        * sticky time column uses — and the column comes later in the document,
        * so it painted straight over the left-hand end of the message. The
        * first thing a business sees on its first morning was cut in half by
        * its own diary.
        *
        * And on a phone the day is a list now, which says "nothing booked
        * today" itself. Both were rendering, one on top of the other. So this
        * follows the grid exactly: hidden on a phone in day view, where the
        * list has it covered, and shown everywhere the grid is.
        */}
      {entries.length === 0 && (
        <div
          className={`pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center px-6 ${
            view !== "month" ? "hidden sm:flex" : ""
          }`}
        >
          {/*
            * On a surface of its own, because grid lines run underneath it.
            *
            * Set on the ruled paper it was reading as something written across
            * the diary rather than something about it, and the button in
            * particular disappeared into the eleven o'clock line.
            */}
          <div className="max-w-xs rounded-2xl border border-border bg-surface/95 px-5 py-4 text-center shadow-[var(--shadow-pop)] backdrop-blur-sm">
            {capacity === 0 ? (
              <>
                <p className="text-sm font-medium">Your hours aren&rsquo;t set yet</p>
                <p className="hint mt-1.5">
                  Until they are, the assistant has no times to offer and nothing can be
                  booked — by it or by you.
                </p>
                <Link
                  href="/settings"
                  className="btn pointer-events-auto mt-3.5 inline-flex bg-accent text-on-accent"
                >
                  Set your opening hours
                </Link>
              </>
            ) : (
              <p className="hint">
                Nothing booked{view === "day" ? " today" : " yet"}. Drag down a column to
                put something in.
              </p>
            )}
          </div>
        </div>
      )}

        {view === "month" ? (
          <MonthGrid
            weeks={monthWeeks}
            entries={entries}
            monthIndex={anchor.getMonth()}
            todayKey={isoDate(new Date())}
            timezone={studio.timezone}
            colourBy={(studio.diary_colour ?? "category") as ColourMode}
          />
        ) : (
          <>
            {/*
              * One day, two shapes.
              *
              * A column per person is a desktop idea, and measured on a 390px
              * phone it gave four and three quarter hours of the day, two of
              * three people, and a sideways scroll to reach the third — inside
              * a vertical scroll inside a scrolling page. On a phone the
              * question is "what am I doing next", and a list answers it in the
              * first inch of the screen.
              *
              * Week keeps the grid at every size: comparing days across a week
              * is the whole point of it, and a list of forty appointments is
              * not a week.
              */}
            {/*
              * On an empty day, say what is next.
              *
              * Looking at a real business's phone: "Nothing booked today" and
              * then three hundred pixels of nothing, while the app knew
              * perfectly well that her next job was Tuesday at two and was
              * showing it in a sidebar that a phone never draws. The one thing
              * worth saying on an empty day was the one thing only a desktop
              * was told.
              */}
            {view === "day" && todayIsEmpty && (
              <div className={panes.list}>
                <UpNext timezone={studio.timezone} team={team} className="mt-3" />
              </div>
            )}

            {/* Month has its own grid above; this branch is day or week. */}
            {(
              <div className={panes.list}>
                {/*
                  * Push the day sideways to change it, the way every calendar
                  * on a phone works. The arrows are at the top of the screen,
                  * which is the furthest point from a thumb.
                  *
                  * Day only: in a week the list already shows all seven, so a
                  * swipe would be moving something that is already on screen.
                  */}
                {view === "day" && <SwipeDays back={dayBack} forward={dayForward} />}
                <DayList
                  entries={entries}
                  artists={focused ? team.filter((a) => a.id === focused) : team}
                  timezone={studio.timezone}
                  /*
                    * One day, or the seven of the week. The same rows either
                    * way — a week on a phone is a day list with headings
                    * through it, because a seven-column grid at 360px shows
                    * two of them and hides the rest behind a sideways scroll.
                    */
                  days={
                    view === "day"
                      ? [isoDate(focusDay)]
                      : Array.from({ length: 7 }, (_, i) => isoDate(addDays(start, i)))
                  }
                  colourBy={(studio.diary_colour ?? "category") as ColourMode}
                  nowIso={new Date().toISOString()}
                />
              </div>
            )}

            <div className={panes.grid}>
              <WeekGrid
                weekStart={isoDate(start)}
                day={isoDate(focusDay)}
                view={view}
                colourBy={(studio.diary_colour ?? "category") as ColourMode}
                entries={entries}
                artists={focused ? team.filter((a) => a.id === focused) : team}
                hours={studio.hours}
                timezone={studio.timezone}
              />
            </div>
          </>
        )}
      </div>

    </div>
  );
}

/**
 * One number from the strip.
 *
 * Deliberately quiet: this sits above the diary and must never compete with
 * it. The only one allowed any colour is what the period earns.
 */
function Figure({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        className={`font-display text-base font-semibold tabular-nums ${accent ? "text-accent" : ""}`}
      >
        {value}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </span>
  );
}
