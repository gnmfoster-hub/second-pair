import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * Every login there is, however many there are.
 *
 * Supabase returns a page at a time and a thousand is the most it will give
 * for one. Two places asked for a thousand and treated the answer as all of
 * them: the platform report, which uses it to say when each business last
 * signed in, and setting up a new business, which uses it to decide whether
 * somebody already has a login.
 *
 * Neither fails when the thousand-and-first arrives. They quietly get the
 * wrong answer — a business shows as "nobody has ever signed in" when they
 * signed in this morning, and an existing owner is given a second account
 * against the same address, which is the one that hurts: their businesses end
 * up split across two logins and only one of them can see anything.
 *
 * Paged properly, and bounded, because a loop with no end on somebody else's
 * pagination is its own kind of accident.
 */
export async function everyUser(db: SupabaseClient): Promise<User[]> {
  const users: User[] = [];

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`could not read the logins: ${error.message}`);

    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }

  return users;
}

/**
 * The login for an address, or nothing.
 *
 * The question both callers actually ask, and asking it directly means the
 * paging above stops as soon as it has the answer rather than reading every
 * account on the platform to find one.
 */
export async function userByEmail(db: SupabaseClient, email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`could not read the logins: ${error.message}`);

    const batch = data?.users ?? [];
    const found = batch.find((u) => u.email?.trim().toLowerCase() === wanted);
    if (found) return found;
    if (batch.length < 1000) return null;
  }

  return null;
}
