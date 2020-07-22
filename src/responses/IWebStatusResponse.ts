import { IWebHookEvent } from './IWebHookEvent';

export type NodeStatus = 'STARTING' | 'RUNNING' | 'CLOSING' | 'ERROR';
export type NetworkStatus = 'HEALTHY' | 'DOWN' | 'PARTIAL';

/**
 * Structure required when responding to a /status GET request.
 */
export interface IWebStatusResponse {
  /**
   * Current status of the specific emitter that was contacted.
   */
  nodeStatus: NodeStatus;

  /**
   * Last known status of the entire network.
   */
  networkStatus: NetworkStatus;

  /**
   * Last known list of servers, including this one. This is generally updated
   * on every change, or at each heartbeat at the latest.
   */
  servers: string[];

  /**
   * List of last known events with active listeners in the network. If you
   * want to force a recheck of this list, call /event-names instead.
   */
  eventNames: Omit<IWebHookEvent, 'args'>[];
}