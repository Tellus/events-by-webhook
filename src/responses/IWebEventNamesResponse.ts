import { IBaseWebEventEmitterResponse } from './IBaseWebEventEmitterResponse';

export interface IWebEventNamesResponse extends IBaseWebEventEmitterResponse {
  /**
   * 
   */
  events: string[];
}