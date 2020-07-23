import { expect, assert } from 'chai';
import { WebEventEmitter } from '../src/WebEventEmitter';
import { WebEventEmitterClient } from '../src/WebEventEmitterClient';

describe('WebEventEmitterClient', () => {
  var emitter:WebEventEmitter;
  var client:WebEventEmitterClient

  function addressFail(): void {
    return assert.fail('Address MUST be defined in this test case. Something is wrong.');
  }

  beforeEach(async () => {
    emitter = new WebEventEmitter({
      port: 0,
    });

    await emitter.listen();

    console.debug(`Test emitter should be listening on ${emitter.address()}.`);
    const address = emitter.address();
    if (!address) return addressFail();

    client = new WebEventEmitterClient(address);
  });

  afterEach(async () => {
    emitter.dispose();
  });

  it('Should correctly report isAlive for a live server', async () => {
    expect(await client.isAlive()).to.be.true;
  });

  it('Should correctly report isAlive for a dead server', async () => {
    emitter.close();
    expect(await client.isAlive()).to.be.false;
  });

  it('Should correctly report events with listeners', async () => {
    const listen1 = () => {};
    const listen2 = () => { console.debug('NOOP'); }

    const event1 = 'nothing';
    const event2 = 'bupkiss';

    emitter.on(event1, listen1);
    emitter.on(event2, listen2);

    const names = await client.eventNames();
    expect(names).to.not.be.empty;
    expect(names.length).to.equal(2);
    expect(names.indexOf(event1)).to.be.gte(0)
    expect(names.indexOf(event2)).to.be.gte(0);
  });

  it('Should correctly trigger a remote event', async () => {
    let wasTriggered = false;

    const event1 = 'EVENTNAME';

    emitter.on(event1, () => wasTriggered = true);

    await client.emit(event1);
    
    expect(wasTriggered).to.be.true;
  });

  it('Should correctly report its known servers', async () => {
    const address1 = emitter.address();
    if (!address1) return addressFail();
    const emitter2:WebEventEmitter = new WebEventEmitter({
      port: 0,
      connectTo: address1,
    });
    await emitter2.listen();
    const address2 = emitter2.address();
    if (!address2) return addressFail();

    const servers = await client.serverNames();

    expect(servers).to.not.be.empty;
    expect(servers.indexOf(address1)).to.be.gte(0);
    expect(servers.indexOf(address2)).to.be.gte(0);
  });
});