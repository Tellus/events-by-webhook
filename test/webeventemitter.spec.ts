import { expect, assert } from 'chai';
import { WebEventEmitter } from '../src/WebEventEmitter';
import { IWebStatusResponse } from '../src/responses';
import got from 'got';
import { WebEventEmitterClient } from '../src/WebEventEmitterClient';

describe('WebEventEmitter', () => {
  let emitter:WebEventEmitter;

  function addressFail(): void {
    return assert.fail('Address MUST be defined in this test case. Something is wrong.');
  }

  beforeEach(async () => {
    emitter = await WebEventEmitter.Create({
      name: '(UNIT_TEST) Base Emitter',
    });
  });

  afterEach(async () => {
    await emitter.dispose();
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
    var e:WebEventEmitter = await WebEventEmitter.Create({
      port: port,
      name: '(UNIT TEST) Port report test',
    });

    const actAddress = e.address();
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

    const e:WebEventEmitter = await WebEventEmitter.Create({
      host: _host,
      port: _port,
      name: '(UNIT TEST) Host+port report test',
    });

    const addr = e.address();
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

    const e:WebEventEmitter = await WebEventEmitter.Create({
      host: _host,
      port: _port,
      baseUrl: _baseUrl,
      name: '(UNIT TEST) baseUrl report test',
    });

    const addr = e.address();
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
    const addr = emitter.address();

    if (!addr) return addressFail();

    const statusResult:IWebStatusResponse = await got.get(`${addr}status`).json<IWebStatusResponse>();

    // Improve test.
    expect(statusResult.success).to.exist;
  });

  it('Should connect to a different emitter and report its address', async () => {
    const emitterAddress = emitter.address();
    if (!emitterAddress) return addressFail();
    if (!await new WebEventEmitterClient(emitterAddress).isAlive()) {
      throw new Error(`Emitter listening but not alive!`);
    }

    const bob = await WebEventEmitter.Create({
      connectTo: emitterAddress,
      name: '(UNIT TEST) Remote address report test',
    });
    const bobAddress = bob.address();
    if (!bobAddress) return addressFail();

    const servers = await bob.serverList();

    // Expect the list to be non-null.
    expect(servers).to.not.be.empty;
    // Expect it to contain both the local and remote emitter.
    expect(servers.length).to.equal(2);
    // Expect the remote emitter to be present in the list.
    expect(servers).to.contain(emitterAddress);
    // Expect the local emitter to be present in the list.
    expect(servers).to.contain(bobAddress);

    await bob.dispose();
  });

  it('Should emit an event to a connected emitter', async () => {
    const eventName:string = 'EVENT_MY_EVENT';

    const address = emitter.address();
    if (!address) return addressFail();

    const bob = await WebEventEmitter.Create({
      connectTo: address,
      name: '(UNIT TEST) Remote emit test',
    });

    var wasEmitted:boolean = false;

    emitter.on(eventName, () => wasEmitted = true);

    const hadListeners:boolean = await bob.globalEmit(eventName);

    expect(wasEmitted).to.be.true;
    expect(hadListeners).to.be.true;

    await bob.dispose();
  });

  // TODO: This test fails (GOOD!) because we are asking emitter to emit an
  // event (which it does), but it doesn't know about bob, meaning that the
  // event is never sent. Implementing reciprocal registration should fix this
  // test as well as the current issue in WebEventEmitterClient.
  it('Should receive a remote event', async () => {
    const address = emitter.address();
    if (!address) return addressFail();
    const bob = await WebEventEmitter.Create({
      connectTo: address,
      name: '(UNIT TEST) Remote receive test',
      verbose: true,
    });
    const bobAddress = await bob.address();
    if (!bobAddress) return addressFail();

    var wasEmitted:boolean = false;

    bob.on('EVENT', () => wasEmitted = true);

    const hadListeners:boolean = await emitter.globalEmit('EVENT');

    expect(wasEmitted).to.be.true;
    expect(hadListeners).to.be.true;

    await bob.dispose();
  });

});