/**
 * Contains functions for all the actions that can be sent to a WebEventEmitter.
 * The API is not final - maybe we can merge it closer with WebEventEmitter in
 * a more elegant way.
 */

import axios, { AxiosAdapter, AxiosInstance } from 'axios';
import { isIWebStatusResponse, isPOJO } from './Util';

/**
 * Small client class for a remote WebEventEmitter. Basically wraps the HTTP(S)
 * requests necessary.
 */
export default class WebEventEmitterEndpoint {
  private axios:AxiosInstance;

  constructor(public readonly baseUrl: string) {
    this.axios = axios.create({
      baseURL: this.baseUrl,
    });
  }

  /**
   * Returns true if the endpoint responds to WebEventEmitter requests, i.e. it
   * accepts HTTP(S) requests and will return something that looks like a
   * IWebStatusResponse on the /status path. 
   */
  async isAlive(): Promise<boolean> {
    try {
      const result = await this.axios.get('status');
      
      return isIWebStatusResponse(result.data);
    } catch (_err) {
      // We don't care about the error type, just that it's there.
      //const err:AxiosError = _err as AxiosError;

      return false;
    }
  }

  async serverNames(endpoint: string): Promise<string[]> {
    const result = await this.axios.get('status');

    const status = result.data;

    if (isIWebStatusResponse(status))
      return status.servers;
    else throw new Error('Bad response object received from remote.');
  }

  /**
   * 
   * @param event 
   * @param args 
   */
  async emit(event: string| symbol, args: any): Promise<boolean>{
    if (!isPOJO(args)) throw Error('Event args is not a POJO.');

    const result = this.axios.post()
  }
}