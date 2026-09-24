import { redirect } from "next/navigation";

/**
 * The walk-through moved.
 *
 * Giles: "fold the walk-through into the working page." It was its own route
 * and a second screen about being set up, which is one of the things he meant
 * when he said the whole thing felt muddled. Everything it did now happens at
 * /settings/working — the owner's full picture, and for everybody else the
 * same short list of their own things, unchanged.
 *
 * A redirect rather than a deletion, and permanent. This address has been
 * handed to people in set-up emails and read out on the phone, it is where the
 * inbox panel used to point, and somebody who bookmarked it a month ago should
 * land on the page that replaced it rather than on a 404 telling them the
 * product lost something.
 */
export default function SetupMoved() {
  redirect("/settings/working");
}
