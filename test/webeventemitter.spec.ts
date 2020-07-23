import { expect, assert } from 'chai';
import { WebEventEmitter } from '../src/WebEventEmitter';
import { IWebStatusResponse } from '../src/responses';
import got from 'got';

describe('WebEventEmitter', () => {
  let emitter:WebEventEmitter;

  function addressFail(): void {
    return assert.fail('Address MUST be defined in this test case. Something is wrong.');
  }

  function createEmitter():WebEventEmitter {
    return new WebEventEmitter({
      
    });
  }

  beforeEach(() => {
    emitter = createEmitter();
  });

  afterEach(async () => {
    try {
      // TODO: Re-enable!!!
      // await emitter?.dispose();
    } finally {
      /* OK */
    }
  });

  after(() => {
    console.debug('ALL TESTS DONE');
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
    // Should always yield an address when actively listening.

    expect(actAddress).to.exist;
    if (actAddress) {
      // TODO: Use a better assertion.
      var threw = false;

      try {
        await got.get(actAddress);

        expect(threw).to.be.false;
      } catch (err) {
        threw = true;
      } finally {
        await e.dispose();
      }
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
    if (!addr) return addressFail();
    
    var threw = false;

    try {
      await got.get(addr);

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
    if (!addr) return addressFail();

    expect(typeof addr).to.equal('string');
    expect(addr).to.equal(_baseUrl);

    var threw = false;

    try {
      await got.get(addr);

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

    const statusResult:IWebStatusResponse = await got.get(addr).json<IWebStatusResponse>();

    expect(statusResult.nodeStatus).to.equal('RUNNING');
  });

  it('Should connect to a different emitter and report its address', async () => {
    await emitter.listen();

    const emitterAddress = emitter.address();
    if (!emitterAddress) return addressFail();

    const bob = new WebEventEmitter({
      connectTo: emitterAddress,
    });
    await bob.listen();

    const servers = await bob.serverList();

    console.debug(servers);
    expect(servers).to.not.be.empty;
    expect(servers.length).to.equal(2); // Local and remote emitter = 2.
    servers.forEach(val => console.debug(val));
    expect(servers[0]).to.equal(emitter.address());

    await bob.dispose();
  });

  it('Should emit an event to a connected emitter', async () => {
    const eventName:string = 'EVENT_MY_EVENT';

    await emitter.listen();
    const address = emitter.address();
    if (!address) return addressFail();

    const bob = new WebEventEmitter({
      connectTo: address,
    });
    await bob.listen();

    var wasEmitted:boolean = false;

    emitter.on(eventName, () => wasEmitted = true);

    const hadListeners:boolean = await bob.globalEmit(eventName);

    expect(wasEmitted).to.be.true;
    expect(hadListeners).to.be.true;

    await bob.dispose();
  });

  it('Should receive a remote event', async () => {
    await emitter.listen();
    const address = emitter.address();
    if (!address) return addressFail();
    const bob = new WebEventEmitter({
      connectTo: address,
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