'use strict';

import { EventEmitter, EventEmitterOptions } from 'events';
import { URL } from 'url';
import { Server } from 'http'; // https.Server basically uses http.Server.
import bodyparser from 'koa-bodyparser';
import Application from 'koa';
import Router from '@koa/router';

/**
 * Options specific to running a WebEventEmitter that listens for incoming
 * events on a port.
 */
export interface IServerOptions {

}

/**
 * Options specific to running 
 */
export interface IRemoteOptions {
  /**
   * Full URL (including port) to a WebEventEmitter endpoint.
   */
  endpoint: string;

  /**
   * If set, will be used to authenticate against 
   */
  secret?: string;
}

export interface IWebEventEmitterOptions {
  /**
   * If set, is used as the fully-qualified endpoint for this emitter. Path
   * prefixes and similar are pulled from this.
   */
  baseUrl?: URL;

  /**
   * If set, is used as host for the listener, passed directly to koa.
   * Defaults to 'localhost'.
   */
  host?: string;

  /**
   * If set, this is the port that the web server will listen on, passed to koa.
   * Defaults to 8080.
   */
  port?: number;
}

/**
 * 
 * @param length Length of string to generate.
 * @param chars Valid characters. Defaults to all alphanumeric, [a-zA-Z0-9].
 */
function randomString(length: number, chars: string): string {
  return '';
}

type OuterFunction = Function & { listener: (... args:any[]) => void };

/**
 * Extension of the regular EventEmitter that acts either as an end node or
 * central mediator for a small network of WebEventEmitter instances.
 * Listens for incoming web requests on a network port, emitting them to any
 * local listeners. Doubles as a regular EventEmitter, so any local calls to
 * 
 * Implementation detail:
 * The *CURRENT* implementation adds an additional event listener for each
 * 
 * The *OLD* implementation wraps event listeners in
 * a function that will handle the web portion and then invoke the listener.
 * This allows us to rely on most of the default EventEmitter implementation.
 * The alternative would have us register an extra, separate event handler,
 * which had to be filtered out in many queries.
 */
export class WebEventEmitter extends EventEmitter {
  private koaApplication:Application;
  private koaServer:Server;

  private internalEventListenerName:string = "blaargh!";

  constructor(private options ?: IWebEventEmitterOptions & EventEmitterOptions) {
    super(<Pick<IWebEventEmitterOptions,EventEmitterOptions>> options);

    this.koaApplication = new Application();
    this.koaServer = this.koaApplication.listen(this?.options?.port, this?.options?.host);
  }

  async close():Promise<void> {
    this.koaServer.close();
  }

  setMaxListeners(n: number): this {
    super.setMaxListeners(n * 2);
    return this;
  }

  addListener(event: string | symbol, listener: (... args: any[]) => void): this {
    // EventEmitter.addListener doesn't dynamically bind to WebEventEmitter.on,
    // so we have to make this override.
    return this.on(event, listener);
  }

  emit(event: string | symbol, ... args: any[]): boolean {
    const hadListeners:boolean = super.emit(event, ... args);

    if (hadListeners) {
      // TODO: Do *we* delegate to web portion or is that handled by secondary event listener?
      // CURRENTLY handled by secondary event listener.
    }

    return hadListeners;
  }

  listeners(event: string | symbol): Function[] {
    const listeners:OuterFunction[] = super.listeners(event) as OuterFunction[];

    const actualListeners:Array<Function> = [];

    listeners.forEach((v) => {
      console.debug('Pushing internal listener from external.');
      console.debug(`EXTERNAL:${v.toString()}`);
      console.debug(`INTERNAL:${v.listener.toString()}`);
      actualListeners.push(v.listener);
    });

    return actualListeners;
  }

  private createEventHandler(event: string | symbol, listener: (...args: any[]) => void): (... args: any[]) => void {
    const fn = (... args: any[]) => {
      console.debug(`Event ${event.toString()} happened. Send via the net! Also calling!`);
      fn.listener(... args);
    };
    console.debug(`Adding this function to fn.listener: ${listener.toString()}`);
    fn.listener = listener;
    console.debug(`ADDED this function to fn.listener: ${listener.toString()}`);

    return fn;
  }
}