/**
 * Contains functions for all the actions that can be sent to a WebEventEmitter.
 * The API is not final - maybe we can merge it closer with WebEventEmitter in
 * a more elegant way.
 */

import got, { Got } from 'got';
import { isIWebStatusResponse, isPOJO, stringToSymbolOrString } from './Util';
import { IWebHookEvent, IWebEmitResponse, IWebStatusResponse } from './responses';
import { IWebEventNamesResponse } from './responses/IWebEventNamesResponse';

/**
 * Small client class for a remote WebEventEmitter. Basically wraps the HTTP(S)
 * requests necessary.
 */
export class WebEventEmitterClient {
  private http:Got;

  constructor(public readonly baseUrl: string) {
    this.http = got.extend({
      responseType: 'json',
      prefixUrl: this.baseUrl,
    })
  }

  /**
   * Returns true if the endpoint responds to WebEventEmitter requests, i.e. it
   * accepts HTTP(S) requests and will return something that looks like a
   * IWebStatusResponse on the /status path. 
   */
  async isAlive(): Promise<boolean> {
    try {
      const result = (await this.http.get('status', {
        timeout: 100,
        retry: 0,
      }).json());

      const response = result as IWebStatusResponse;

      return response.success;
    } catch (_err) {
      return false;
    }
  }

  async serverNames(): Promise<string[]> {
    const result = await this.http.get('status').json<IWebStatusResponse>();
    return result.servers;
  }

  /**
   * Sends a WebEventEmit to the remote WebEventEmitter. Returns true if the
   * remote emitter had any local listeners.
   * @param event Event name. Symbols are "flattened" to a string representation
   * and left to be parsed by the receiving emitter. Typically, a symbol with
   * the same description is pulled from or created in the local symbol registry.
   * @param args Event arguments. MUST be a POJO (Plain Old Javascript Object),
   * a pure data-only object. The method will throw if this is not the case.
   */
  async emit(event: string| symbol, ... args: any[]): Promise<boolean>{
    if (args.length > 0 && !args.every(isPOJO)) throw Error('Event args is not a POJO.');

    const data: IWebHookEvent = {
      event: event.toString(),
      symbol: typeof event === 'symbol',
      args: args
    };

    try {
      const result = await this.http.post('emit', { json: data }).json<IWebEmitResponse>();

      if (result.success) {
        return result.hadListeners;
      } else throw new Error(result.reason);
    } catch (err) {
      throw err;
    }
  }

  async eventNames(): Promise<(string | symbol)[]> {
    try {
      const result = await this.http.get('event-names').json<IWebEventNamesResponse>();

      if (result.success)
        return result.events.map(stringToSymbolOrString);
      else
        throw new Error(result.reason);
    } catch (err) {
      throw err;
    }
  }
}