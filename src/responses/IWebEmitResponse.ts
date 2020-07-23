import { IBaseWebEventEmitterResponse } from './IBaseWebEventEmitterResponse';

export interface IWebEmitResponse extends IBaseWebEventEmitterResponse {
  hadListeners: boolean;
  event: string;
  symbol: boolean;
}