export interface IWebEmitResponse {
  status: 'ok' | 'error',
  reason?: string,
  listenerCount: number,
  event: string,
  symbol: boolean,
}