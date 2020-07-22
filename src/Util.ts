/**
 * Various utility functions.
 */

import * as _ from 'lodash';
import { IWebHookEvent, IWebStatusResponse } from './responses';

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
  const keys = Reflect.ownKeys(obj);

  return 'servers' in keys && 'nodeStatus' in keys && 'eventNames' in keys && 'networkStatus' in keys;
}

/**
 * Returns true if the passed object is a Plain Old Javascript Object, fit for
 * transmission over the network.
 * @param obj Object to test.
 */
export function isPOJO(obj:any):boolean {
  // Implementation is a terse variant of bttmly's is-pojo package.
  if (obj === null || typeof obj !== 'object') return false;
  else return Object.getPrototypeOf(obj) === Object.prototype;
}