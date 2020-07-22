import mocha from 'mocha';
import { expect } from 'chai';
import { WebEventEmitter, IWebEventEmitterOptions } from '../src/WebEventEmitter';
import { IWebStatusResponse } from '../src/responses';
import Axios from 'axios';
import { createServer } from 'http';
import { AddressInfo } from 'net';

describe('WebEventEmitter', () => {
  let emitter:WebEventEmitter;
  // Used to increment ports used. Should avoid some port clashes.
  var portCounter:number = 10000;

  function createEmitter():WebEventEmitter {
    return new WebEventEmitter({
      host: 'localhost',
      port: ++portCounter,
      baseUrl: `http://localhost:${portCounter}/`,
    });
  }

  beforeEach(() => {
    emitter = createEmitter();
  });

  afterEach(async () => {
    try {
      await emitter?.dispose();
    } finally {
      /* OK */
    }
  });

  it('Should correctly emit an event locally', () => {
    let wasEmitted = false;

    emitter.on('EVENT', () => wasEmitted = true);

    emitter.emit('EVENT');

    expect(wasEmitted).to.be.true;
  })

  it('Should report an available address (port)', async () => {
    const port = 21942;
    // With nothing set, should return a default-ish HttpServer value.
    var e:WebEventEmitter = new WebEventEmitter({
      port: port,
    });
    const actAddress = (await e.listen()).address();

    // TODO: Use a better assertion.
    var threw = false;

    try {
      await Axios.get(actAddress);

      expect(threw).to.be.false;
    } catch (err) {
      threw = true;
    } finally {
      await e.dispose();
    }
  });

  it('Should report an available address (host+port)', async () => {
    const _host = 'localhost';
    const _port = 25218;

    const e:WebEventEmitter = new WebEventEmitter({
      host: _host,
      port: _port,
    });

    const addr = (await e.listen()).address();
    var threw = false;

    try {
      await Axios.get(addr);

      expect(threw).to.be.false;
    } catch (err) {
      threw = true;
    } finally {
      await e.dispose();
    }
  });

  it('Should report an available address (baseUrl)', async () => {
    const _host = 'localhost'; // Should not be reported.
    const _port = 23128; // Should not be reported.
    const _baseUrl = `http://${_host}:${_port}`;

    const e:WebEventEmitter = new WebEventEmitter({
      host: _host,
      port: _port,
      baseUrl: _baseUrl
    });

    const addr = (await e.listen()).address();

    expect(typeof addr).to.equal('string');
    expect(addr).to.equal(_baseUrl);

    var threw = false;

    try {
      await Axios.get(addr);

      expect(threw).to.be.false;
    } catch (err) {
      threw = true;
    } finally {
      await e.dispose();
    }
  });

  it('Should respond to HTTP requests', async () => {
    await emitter.listen();

    const addr = `http://${emitter.options.host}:${emitter.options.port}/status`;

    //console.debug(`Attempting to connect to emitter at ${addr}`);

    const statusResult:IWebStatusResponse = (await Axios.get(addr)).data;

    expect(statusResult.nodeStatus).to.equal('RUNNING');
  });

  it('Should connect to a different emitter and report its address', async () => {
    // Re-initialize emitter.
    await emitter.dispose();
    emitter = new WebEventEmitter({
      host: 'localhost',
      port: 0,
    });
    await emitter.listen();

    const bob = new WebEventEmitter({
      connectTo: emitter.address(),
      port: ++portCounter,
    });
    await bob.listen();

    const servers = await bob.serverList();

    expect(servers).to.not.be.empty;
    expect(servers.length).to.equal(2); // Local and remote emitter = 2.
    servers.forEach(val => console.debug(val));
    expect(servers[0]).to.equal(emitter.address());

    await bob.dispose();
  });

  it('Should emit an event to a connected emitter', async () => {
    await emitter.listen();
    const bob = new WebEventEmitter({
      connectTo: emitter.address(),
      port: ++portCounter,
    });
    await bob.listen();

    var wasEmitted:boolean = false;

    emitter.on('EVENT', () => wasEmitted = true);

    const hadListeners:boolean = await bob.globalEmit('EVENT');

    expect(wasEmitted).to.be.true;
    expect(hadListeners).to.be.true;

    await bob.dispose();
  });

  it('Should receive a remote event', async () => {
    await emitter.listen();
    const bob = new WebEventEmitter({
      connectTo: emitter.address(),
      port: ++portCounter,
    });
    await bob.listen();

    var wasEmitted:boolean = false;

    bob.on('EVENT', () => wasEmitted = true);

    const hadListeners:boolean = await emitter.globalEmit('EVENT');

    expect(wasEmitted).to.be.true;
    expect(hadListeners).to.be.true;

    await bob.dispose();
  });

});