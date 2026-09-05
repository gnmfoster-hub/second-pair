/**
 * Failures a visitor is allowed to be told about.
 *
 * Almost everything that goes wrong inside the engine is nobody's business but
 * ours — a slug, a column name, a database that is having a moment. The widget
 * says "something went wrong, try again" and that is the right answer, because
 * trying again is genuinely what to do.
 *
 * A business that has been stopped is not that. Nothing is wrong and trying
 * again will never help, so telling somebody to retry sends them round a loop
 * on a website whose owner is no longer a customer.
 */
export class NotAnswering extends Error {
  readonly visitorMessage: string;

  constructor(reason: string, visitorMessage: string) {
    super(reason);
    this.name = "NotAnswering";
    this.visitorMessage = visitorMessage;
  }
}
