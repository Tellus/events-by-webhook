'use strict';

import { EventEmitter } from 'events';
import _ from 'lodash';

import { URL } from 'url';
import { Server } from 'http'; // https.Server basically uses http.Server.
import bodyparser from 'koa-bodyparser';
import Application from 'koa';
import Router from '@koa/router';
import koaJwt from 'koa-jwt';
import axios from 'axios';

import * as statusCodes from 'http-status-codes';
import { AddressInfo } from 'net';

/**
 * Options specific to the web portions of the emitter, including listening
 * ports and route prefixes.
 */
export interface IHttpOptions {
  /**
   * Network port to listen on.
   */
  port?: number;
  
  /**
   * If set, will listen on the address or host specified. Defaults to
   * 'localhost'.
   */
  host?: string;

  /**
   * If set, must be the fully qualified URL for this emitters endpoint. This is
   * transmitted to other emitters so they can transmit events to this emitter.
   */
  baseUrl?: string;
}

export interface IWebEventEmitterOptions {
  /**
   * If set, will be used as JWT secret to restrict access to the emitter
   * network.
   */
  secret?: string;

  /**
   * Fully qualified URL to another WebEventEmitter that can connect this
   * emitter to the rest of the network.
   * If unset, WebEventEmitter will act exactly like a regular EventEmitter.
   */
  connectTo?: string;

  /**
   * 
   */
  captureRejections?: boolean;

  /**
   * Time in seconds between each network health check. Each time, the emitter
   * will query 
   */
  keepaliveInterval?: number;

  /**
   * Options specific for the HttpServer portion of the emitter.
   */
  httpServer?: IHttpOptions;
}

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

export interface IWebEmitResponse {
  status: 'ok' | 'error',
  reason?: string,
  listenerCount: number,
  event: string,
  symbol: boolean,
}

type NodeStatus = 'STARTING' | 'RUNNING' | 'CLOSING' | 'ERROR';
type NetworkStatus = 'HEALTHY' | 'DOWN' | 'PARTIAL';

/**
 * Structure required when responding to a /status GET request.
 */
export interface IStatusResponse {
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

export function isSymbol(obj:string | symbol): obj is symbol {
  return _.hasIn(obj, 'description');
}

/**
 * Returns true if the passed object is a Plain Old Javascript Object, fit for
 * transmission over the network.
 * @param obj Object to test.
 */
function isPOJO(obj:any):boolean {
  return _.valuesIn(obj).every((value) => typeof value != 'function' && !(value instanceof Function));
}

/**
 * If value seems to be a Symbol (i.e. "Symbol(someWord)"), function will return
 * a proper Symbol. Otherwise, the value is returned as-is.
 * @param value The string to parse.
 */
function stringToSymbolOrString(value:string): string | symbol {
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
function symbolToString(value:symbol): string {
  const str = value.toString();

  return str.slice(7, str.length - 1);
}

/**
 * These are the "true" default options. We keep these around in case someone
 * accidentally assigns a partial object to httpServer or other nested objects.
 */
const defaultEmitterOptions = {
  captureRejections: false,
  keepaliveInterval: 60 * 1000, // Heartbeat once a minute.
  httpServer: {
    port: 9192, // Default port.
    host: 'localhost',
    baseUrl: '',
  },
};

/**
 * Extension of the regular EventEmitter that acts either as an end node or
 * central mediator for a small network of WebEventEmitter instances.
 * Listens for incoming web requests on a network port, emitting them to any
 * local listeners.
 */
export class WebEventEmitter extends EventEmitter {
  private koaApplication:Application;
  private koaServer?:Server;

  /**
   * Private reference to axios.
   */
  private $http = axios;

  /**
   * Heartbeat interval. At every tick, the emitter checks the rest of the
   * network for updates.
   */
  private keepaliveTimer:ReturnType<typeof setInterval>;

  readonly options: Readonly<IWebEventEmitterOptions>;

  /**
   * Default options used for the emitters. Changing these will only have an
   * effect on any future initializations.
   */
  public static defaultOptions: IWebEventEmitterOptions = _.cloneDeep(defaultEmitterOptions);

/**
 * Sets up a new WebEventEmitter, optionally configured to accept or propagate
 * events through a webserver endpoint.
 * @param options 
 */
  constructor(options ?: IWebEventEmitterOptions) {
    super({ captureRejections: options?.captureRejections });

    // Merge the passed options over the default options, yielding this
    // instance's final options.
    this.options = {
      ... defaultEmitterOptions,
      ... WebEventEmitter.defaultOptions,
      ... options,
      httpServer: {
        ... defaultEmitterOptions.httpServer,
        ... WebEventEmitter.defaultOptions.httpServer,
        ... options?.httpServer,
      },
    };

    this.koaApplication = this.createListenerApplication();
    
    if (this.options.connectTo) {
      this.$http.defaults = {
        baseURL: options?.connectTo
      }
    } else {
      // Warning! We're NOT connected anywhere!
    }

    // TODO: Is there a way to do this assignment without casting to "any" first?
    this.keepaliveTimer = <any>setInterval(() => console.debug('Checking network health.'), this.options.keepaliveInterval);
  }

  /**
   * Starts listening for incoming events from other WebEventEmitters. If this
   * emitter was configured as a propagator, it will retransmit incoming events.
   * Otherwise, it will simply re-emit incoming events locally.
   * @param port Optionally set a port to listen to. If unset, uses what was set
   * during initialization.
   * @param host Optionally set the host to bind to. If unset, uses what was set
   * during initialization.
   */
  listen(): this {
    this.koaServer = this.koaApplication.listen(
      this.options.httpServer?.port,
      this.options.httpServer?.host
    );

    return this;
  }

  /**
   * Closes the webserver, halting its listening and freeing up the port. Make
   * sure to call this before the rest of your code finishes, otherwise the
   * node process will "lock" and the server keeps listening.
   */
  async close():Promise<void> {
    this.koaServer?.close();
  }

  /**
   * Closes/releases the resources taken up by this WebEventEmitter. Notably,
   * this closes the HttpServer if it is running, and clears the various timers.
   * Make sure to call this before your code ends, or the process may end up
   * "hanging".
   */
  async dispose():Promise<void> {
    clearTimeout(this.keepaliveTimer);
    await this.koaServer?.close();
  }

  /**
   * Fires an event. The event *will* be propagated to other servers, but the
   * return value only reflects whether there were any *local* listeners. Pass
   * a callback to be notified once the event has been propagated fully that
   * can tell if whether the other emitters had any listeners.
   * @see globalEmit for a Promise-based version of this function.
   * @param event The event to trigger.
   * @param remoteCallback If set, will be called once all other emitters have
   * fired their events locally.
   * @param args Arguments to pass to listeners. NOTE! While local (in-process)
   * listeners can work with any sort of reference it is passed, remote
   * listeners can't. To avoid problems, only use POJOs as arguments - pure
   * data, all the way down. 
   */
  emit(event: string | symbol, onPropagated?:(err: any, hadListeners:boolean) => void, ... args: any[]): boolean {
    if (!isPOJO({ ... args }))
      throw new Error('Some of the event data can not be serialized. Propagation halted.');

    // Store the local emit result, so we can inform the propagated targets of
    // local event propagation.
    let hadListeners = super.emit(event, ... args);

    try {
      console.debug(`Propagating event...`);
      const asJson = JSON.stringify(args);
    } catch (err) {
      console.error(`Failed to stringify event payload: ${err}`);

      // OR the current result of hadListeners with the result of propagating
      // the event, to indicate "any listeners at all"
      throw new Error('Proper propagation not yet implemented (cannot await).');
      //hadListeners = hadListeners || await this.propagateEvent(event, args);
    }
    
    return hadListeners;
  }

  /**
   * Fires an event to all *local* listeners and returns a value signaling
   * whether there were any listeners for this particular event.
   * @param event The event to fire.
   * @param args Any arguments to pass to any listeners.
   */
  localEmit(event: string | symbol, ... args: any[]): boolean {
    return super.emit(event, ... args);
  }

  /**
   * Fires an event locally AND to known WebEventEmitters.
   * @param event The event to fire.
   * @param args Any arguments to be passed along to listeners.
   */
  async globalEmit(event: string | symbol, ... args: any[]): Promise<boolean> {
    const hadLocalListeners = this.localEmit(event, ... args);

    // Fire up a promise for each separate server, then wait for them all to finish.
    const hadListenerCollection:boolean[] = await Promise.all<boolean>(_.map(
      await this.serverList(),
      (value) => {
        return this.remoteEmit(value, event, ... args);
      },
    ));

    // Reduce them all to a single boolean with the OR operator.
    const hadAnyListeners:boolean = _.reduce(hadListenerCollection,
      (acc, val) => {
        return acc || val;
      }, hadLocalListeners
    );

    // And return a trivial promise.
    return Promise.resolve<boolean>(hadAnyListeners);
  }

  /**
   * Asynchronously fires an event at a single remote server.
   * @param server The fully-qualified URL of the receiving WebEventEmitter.
   * @param event The event to fire.
   * @param args Any data to send along.
   */
  private async remoteEmit(server:string, event: string | symbol, ... args: any[]): Promise<boolean> {
    const weData:IWebHookEvent = {
      event: isSymbol(event) ? symbolToString(event) : event,
      symbol: isSymbol(event),
      args: args,
    }

    const result:IWebEmitResponse = await this.$http.post('/emit', weData);

    return new Promise<boolean>((resolve, reject) => {
      if (result.status == 'ok') resolve(result.listenerCount > 0);
      else reject(result.reason)
    });
  }

  // Called internally when receiving events via the endpoint. 
  private onWebEmit(eventName: string, ... args: any[]):boolean {
    // Local event emission.
    return super.emit(stringToSymbolOrString(eventName), args);
  }

  /**
   * Queries the other WebEventEmitters and returns a collection of unique
   * event names.
   */
  // TODO: IMPLEMENT.
  // async remoteEventNames(): Promise<(string | symbol)[]> {
  //   const servers = await this.serverList();

  //   const eventNames:Set<string | symbol>;



  //   servers.forEach((server) => {

  //   });
  // }

  async serverStatus():Promise<NodeStatus> {
    // TODO: Implement an actual health check.
    return 'RUNNING';
  }

  async networkStatus():Promise<NetworkStatus> {
    // TODO: Implement an actual health check.
    return 'HEALTHY';
  }

  /**
   * Retrieves the server's address, as returned by HttpServer.address.
   * TODO: Is this the value we're looking for, really?
   * TODO: Can we simplify the return type? Like ReturnType<Server.address>
   */
  address(): string {
    console.debug('Address requested:');
    if (this.koaServer) {
      const addr = this.koaServer.address();

      console.debug(addr);
      if (addr != null && addr != undefined) {
        if (typeof addr == 'string') return addr;
        else return `http://${addr.address}:${addr.port}`;
      } else throw Error('Very bad error! koaServer defined but no address was returned!');
    } else throw new Error('HttpServer is not running.');
  }

  async serverList():Promise<string[]> {
    const thisAddr = this.address();

    const l = [];

    if (thisAddr) {
      l.push(thisAddr.toString());
    }

    return l;
  }

  private createListenerApplication():Application {
    const app = new Application();

    // IF a secret has been set, add an auth middleware.
    if (this.options.secret) {
      app.use(koaJwt({
        secret: this.options.secret,
      }));  
    }
    
    // For parsing POST bodies.
    app.use(bodyparser({

    }));

    // The actual router. The event emitter has its basic event notification
    // endpoint, but also a status route that contains current health data, as
    // well as an info route to query known event names and listeners from the
    // network.
    const router:Router = new Router({

    });

    /**
     * For emitting an event. The POST body must conform to the structure of
     * the IWebHookEvent interface.
     */
    router.post('/emit', (ctx) => {
      const data = ctx.request.body;
      if (isIWebHookEvent(data)) {
        ctx.status = 200;
        ctx.body = {
          status: 'OKAY',
          message: 'We good, homes.',
        };
      } else {
        ctx.status = statusCodes.BAD_REQUEST;
        ctx.body = {
          status: 'ERROR',
          message: 'POST body was badly formatted.',
        };
      }
    });

    router.get('/status', async (ctx) => {
      const status:IStatusResponse = {
        nodeStatus: await this.serverStatus(),
        networkStatus: await this.networkStatus(),
        servers: await this.serverList(),
        eventNames: [], // TODO: Fill out!
      };

      ctx.status = 200;
      ctx.body = status;
    });

    router.get('/event-names', (ctx) => {
      ctx.body = {
        status: 'OK',
        eventNames: this.eventNames(),
      }
    })

    app.use(router.routes());
    app.use(router.allowedMethods());

    return app;
  }
}