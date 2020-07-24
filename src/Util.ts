/**
 * Various utility functions.
 */

import * as _ from 'lodash';
import { IWebHookEvent, IWebStatusResponse } from './responses';
import { runInThisContext } from 'vm';

 /**
 * Attempts to discern whether obj is a proper IWebHookEvent.
 * @param obj The object to test.
 */
export function isIWebHookEvent(obj:any): obj is IWebHookEvent {
  const cons:IWebHookEvent = obj as IWebHookEvent;

  return cons.event != undefined
      && (cons.symbol == undefined || typeof cons.symbol == 'boolean')
      && (cons.args == undefined || typeof cons.args == 'object');
}

export function isIWebStatusResponse(obj:any): obj is IWebStatusResponse {
  const thing = obj as IWebStatusResponse;

  return thing.success != undefined
    && thing.nodeStatus != undefined
    && thing.eventNames != undefined
    && thing.networkStatus != undefined
    && thing.servers != undefined;
}

/**
 * Returns true if the passed object is a Plain Old Javascript Object, fit for
 * transmission over the network.
 * The initial implementation was inspired by the is-pojo package but differs
 * significantly to our needs.
 * TODO: Recursion!
 * @param obj Object to test.
 */
export function isPOJO(obj:any):boolean {
  // Base test.
  if (obj === null || typeof obj !== 'object') return false;
  // Make sure that there are no functions.
  if (_.valuesIn(obj).some(value => typeof value === 'function')) return false;
  // Otherwise, return final test.  
  return Object.getPrototypeOf(obj) === Object.prototype;
}

/**
 * If value seems to be a Symbol (i.e. "Symbol(someWord)"), function will return
 * a proper Symbol. Otherwise, the value is returned as-is.
 * @param value The string to parse.
 */
export function stringToSymbolOrString(value:string): string | symbol {
  if (value.startsWith('Symbol(') && value.endsWith(')')) {
    // Assume proper symbol. Coerce.
    return Symbol.for(value.slice(7, value.length - 1));
  } else return value;
}

/**
 * For some reason, TypeScript doesn't know of the "description" instance
 * property of Symbol. This function just pulls it out from toString() instead.
 * @param value The symbol to drag a string out of.
 */
export function symbolToString(value:symbol): string {
  const str = value.toString();

  return str.slice(7, str.length - 1);
}