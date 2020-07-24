'use strict';

import { EventEmitter } from 'events';
import _ from 'lodash';

import { Server } from 'http'; // https.Server basically uses http.Server.
import bodyparser from 'koa-bodyparser';
import Application from 'koa';
import Router from '@koa/router';
import koaJwt from 'koa-jwt';
import got, { Got } from 'got';
import { WebEventEmitterClient } from './WebEventEmitterClient';

import * as statusCodes from 'http-status-codes';
import { AddressInfo } from 'net';

import * as os from 'os';
import { isPOJO, isIWebHookEvent, symbolToString, stringToSymbolOrString } from './Util';
import { IWebHookEvent, IWebEmitResponse, NodeStatus, NetworkStatus, IWebStatusResponse } from './responses';
import { IWebEventNamesResponse } from './responses/IWebEventNamesResponse';

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

  port?: number;

  host?: string;

  baseUrl?: string;

  /**
   * Optional name for the emitter. Useful in debugging and will be used if
   * logging is enabled.
   */
  name?: string;

  /**
   * Optional description for the emitter. Can be useful in debugging.
   */
  description?: string;
  
  /**
   * Be verbose in stdout?
   */
  verbose?: boolean;
}

/**
 * These are the "true" default options. We keep these around in case someone
 * accidentally assigns a partial object to httpServer or other nestedyo objects.
 */
const defaultEmitterOptions:IWebEventEmitterOptions = {
  captureRejections: false,
  keepaliveInterval: 60 * 1000, // Heartbeat once a minute.
  port: 0, // Randomly assign a port.
  // Host on all interfaces.
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
  private $http:Got;

  /**
   * Heartbeat interval. At every tick, the emitter checks the rest of the
   * network for updates.
   */
  private keepaliveTimer:ReturnType<typeof setTimeout>;

  /**
   * Options object for this emitter instance. Read-only.
   */
  readonly options: Readonly<IWebEventEmitterOptions>;

  /**
   * Most recent list of known event emitters.
   */
  private cachedServerList:string[] = [];

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
  private constructor(options ?: IWebEventEmitterOptions) {
    super({ captureRejections: options?.captureRejections });

    // Merge the passed options over the default options, yielding this
    // instance's final options.
    this.options = {
      ... defaultEmitterOptions,
      ... WebEventEmitter.defaultOptions,
      ... options,
    };

    if (options?.connectTo) {
      this.cachedServerList = [ options.connectTo ];
    }

    this.koaApplication = this.createListenerApplication();

    this.$http = got.extend({
      // Any got options?
      retry: 3,
      timeout: 1000,
      throwHttpErrors: true,
    });

    // TODO: Is there a way to do this assignment without casting to "any" first?
    this.keepaliveTimer = <any>setTimeout(async () => {
      try {
        this.log('Checking network health.');
        await this.networkSync();
      } catch (err) {
        this.log(`Failed to perform timed sync! ${err.toString()}`, 'ERROR');
      } finally {
        this.keepaliveTimer.refresh();
      }
    }, this.options.keepaliveInterval);
    // Allow the process to exit without being locked to this handler.
    this.keepaliveTimer.unref();
  }

  private log(msg:string, type: 'INFO' | 'ERROR' | 'TRACE' | 'LOG' | 'WARN' = 'INFO'):void {
    if (!this.options.verbose) return;

    const pre = this.options.name ? this.options.name : 'UNNAMED';
    const toPrint = `[${pre}:${this.address()}]: ${msg}`;

    var printFn:Function;

    switch(type) {
      case 'ERROR': printFn = console.error; break;
      case 'INFO': printFn = console.info; break;
      case 'TRACE': printFn = console.trace; break;
      case 'LOG': printFn = console.log; break;
      case 'WARN': printFn = console.warn; break;
    }

    printFn(toPrint);
  }

  /**
   * Creates a new WebEventEmitter and ensures an initial network sync before
   * returning the instance. This is the preferred method of creating a new
   * instance, as an exception will be thrown if the instance fails to start
   * listening or connecting to other emitters.
   * @param options Options for the new instance.
   */
  public static async Create(options ?: IWebEventEmitterOptions): Promise<WebEventEmitter> {
    const emitter:WebEventEmitter = new WebEventEmitter(options);

    if (options && !options.name) {
      emitter.log('WebEventEmitter instantiated with no name', 'WARN');
    }

    try {
      if (options?.connectTo) {
        const remote:WebEventEmitterClient = new WebEventEmitterClient(options?.connectTo);

        if (!await remote.isAlive()) throw new Error(`Could not connect to seed emitter at ${options.connectTo}.`);

        // Force a network sync against a single server.
        await emitter.networkSync(options.connectTo);
      }

      await emitter.listen();
      
      return emitter;
    } catch (err) {
      throw new Error(`Failed to create new WebEventEmitter: ${err.toString()}`);
    }
  }

  /**
   * Performs a health check, by syncing with known servers.
   */
  private async networkSync(server?:string): Promise<void> {
    const oldServers = server ? [ server ] : this.cachedServerList;
    
    const serverClients = oldServers.map(serverUrl => new WebEventEmitterClient(serverUrl));
    var newServers:Set<string> = new Set();

    const syncTasks = serverClients.map<Promise<string[]>>(server => {
      return (async ():Promise<string[]> => {
        if (await server.isAlive()) {
          return [ server.baseUrl ].concat(await server.serverNames());
        } else {
          this.log(`SYNC: Server ${server.baseUrl} did not respond. Removing from live list.`, 'WARN');
          return [];
        }
      })();
    });

    const newServerLists:string[][] = await Promise.all(syncTasks);

    this.cachedServerList = Array.from(new Set(_.flatten(newServerLists)));

    this.log(`Network sync. Had ${serverClients.length} servers. Now has ${this.cachedServerList.length} servers.`);
  }

  /**
   * If the internal webserver is currently listening on a port, that port
   * number is returned. Otherwise, nothing.
   */
  get port(): number | undefined {
    if (this.koaServer && this.koaServer.listening) return (<AddressInfo>this.koaServer.address()).port;
    else return undefined;
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
  listen(): Promise<this> {
    return new Promise<this>((resolve, reject) => {
      try {
        if (this.koaServer && this.koaServer.listening)
          reject(new Error('Emitter already listening.'));

        // HttpServer#listen is asynchronous. The callback ensures resolve.
        this.koaServer = this.koaApplication.listen({
            port: this.options.port,
            hostname: this.options.host,
          },
          () => {
            // Bail if we couldn't get listening started properly.
            if (!this.koaServer || !this.koaServer.listening) reject(new Error('Failed to start listening'));
            else resolve(this);
          },
        );
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Closes the webserver, halting its listening and freeing up the port. If
   * you are planning to exit your process, call dispose() instead, as this
   * method does not halt the network monitor.
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
    this.koaServer?.close();
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
  emit(event: string | symbol, ... args: any[]): boolean {
    if (!isPOJO({ ... args }))
      throw new Error('Some of the event data can not be serialized. Propagation halted.');

      // Store the local emit result, so we can inform the propagated targets of
    // local event propagation.
    let hadListeners = this.localEmit(event, ... args);

    // Initiate remote propagation but don't wait for the return value.
    this.log(`Propagating event...`);
    this.remoteEmitOnly(event, ... args)
      .then(hadListeners => this.log(`Finished remote propagation (listeners? ${hadListeners}).`))
      .catch(err => this.log(`Failed to propagate to remotes: ${err.toString()}.`));
    
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
    const hadRemoteListeners = await this.remoteEmitOnly(event, ... args);

    return hadLocalListeners || hadRemoteListeners;
  }

  /**
   * Emits an event to all remote emitters, but NOT locally.
   * @param event The event to fire.
   * @param args Any arguments to be passed along to listeners.
   */
  private async remoteEmitOnly(event: string | symbol, ... args: any[]): Promise<boolean> {
    // Fire up a promise for each separate server, then wait for them all to finish.

    const hadListenerCollection:boolean[] = await Promise.all(_.map(
      await this.serverList(),
      (value) => this.remoteEmit(value, event, ... args)
        .then(hadListeners => {
          this.log(`Successfully emitted to ${value}`);
          return hadListeners;
        })
        .catch(err => {
          this.log(`Failed to emit to ${value}`, 'ERROR');
          return false;
        }),
    ));

    // Reduce them all to a single boolean with the OR operator.
    return _.reduce<boolean, boolean>(hadListenerCollection,
      (acc, val) => acc || val,
      false
    );
  }

  /**
   * Asynchronously fires an event at a single remote server.
   * @param server The fully-qualified URL of the receiving WebEventEmitter.
   * @param event The event to fire.
   * @param args Any data to send along.
   */
  private async remoteEmit(server:string, event: string | symbol, ... args: any[]): Promise<boolean> {
    const client = new WebEventEmitterClient(server);

    return await client.emit(event, ... args);
  }

  // Called internally when receiving events via the endpoint. 
  private onWebEmit(eventName: string, ... args: any[]):boolean {
    // Local event emission.
    return super.emit(stringToSymbolOrString(eventName), args);
  }

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
  address(forceIPv4:boolean = true): string | null {
    // Bail if no defined server.
    if (!this.koaServer) return null;

    // Bail if server isn't listening.
    if (!this.koaServer.listening) return null;
  
    // Returns baseUrl as-is if defined.
    if (this.options.baseUrl)
      return this.options.baseUrl;
  
    // Return address based on host + port, if given.
    if (this.options.host) {
      const port = this.options.port == 0 ? (<AddressInfo>this.koaServer.address()).port : this.options.port;
      return `http://${this.options.host}:${port}/`;
    }

    // At this point, return a "best effort guess" based on the first found
    // non-internal network interface and the configured port.
    const interfaces = os.networkInterfaces();

    // Find all interfaces that are externally accessible (barring a firewall!).
    const networkCandidates = _.flatten(_.values(interfaces)).filter(inf => inf?.internal == false) as (os.NetworkInterfaceInfoIPv4 | os.NetworkInterfaceInfoIPv6)[];

    // If none found, panic.
    if (networkCandidates.length == 0) throw new Error('No predefined host address and no external interfaces found.');

    // Get the address info as reported by the HttpServer, to get the IP family.
    const httpServerAddr = this.koaServer.address() as AddressInfo;

    // Final interface. First external interface that has same family as reported by HttpServer.
    const netInterface = networkCandidates.find(ifs => ifs.family == (forceIPv4 ? 'IPv4' : httpServerAddr.family));

    if (netInterface) {
      if (netInterface.family == 'IPv6') {
        return `http://[${netInterface.address}]:${httpServerAddr.port}/`;
      } else {
        return `http://${netInterface.address}:${httpServerAddr.port}/`;
      }
    } else return null;
  }

  async serverList():Promise<string[]> {
    const serverSet:Set<string> = new Set();
    
    const address = this.address();
    if (address)
      serverSet.add(address);

    this.cachedServerList.forEach(srv => serverSet.add(srv));

    return Array.from(serverSet);
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
    app.use(bodyparser());

    // DEBUG-only accses log.
    app.use((ctx, next) => {
      this.log(`${new Date().toUTCString()}: ${ctx.method} on '${ctx.url}'`);
      return next();
    });

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
        ctx.body = <IWebEmitResponse>{
          success: true,
          hadListeners: this.localEmit(data.symbol ? stringToSymbolOrString(data.event) : data.event, data.args),
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
      ctx.status = 200;
      ctx.body = <IWebStatusResponse>{
        success: true,
        nodeStatus: await this.serverStatus(),
        networkStatus: await this.networkStatus(),
        servers: await this.serverList(),
        eventNames: [], // TODO: Fill out!
      };
    });

    router.get('/event-names', (ctx) => {
      ctx.status = 200;
      ctx.body = <IWebEventNamesResponse>{
        success: true,
        events: this.eventNames(),
      }
    })

    app.use(router.routes());
    app.use(router.allowedMethods());

    return app;
  }
}