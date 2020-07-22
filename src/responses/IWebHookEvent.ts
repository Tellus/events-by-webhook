/**
 * Structure required when sending/receiving an event emit over the web.
 */
export interface IWebHookEvent {
  /**
   * Name of the event, regardless of whether it was originally a pure string or
   * a symbol.
   */
  event: string;

  /**
   * If true, the event is considered a Symbol and the event is emitted with
   * Symbol.for(event) rather than just the event's name.
   */
  symbol?: boolean;

  /**
   * The event arguments. Since this entire structure must be JSON-encoded,
   * arguments can't contain functions or complex objects.
   */
  args: any;
}