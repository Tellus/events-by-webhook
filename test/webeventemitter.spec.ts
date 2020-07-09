import mocha from 'mocha';
import { expect } from 'chai';
import { WebEventEmitter } from '../src/WebEventEmitter';
import { assert } from 'console';

describe('WebEventEmitter', () => {
  let emitter:WebEventEmitter;

  beforeEach(() => {
    emitter = new WebEventEmitter();
  });

  afterEach(() => {
    if (emitter) {
      emitter.removeAllListeners();
      emitter.close();
    }
  });

  it('Should correctly emit an event locally', () => {
    let wasEmitted = false;

    emitter.on('EVENT', () => wasEmitted = true);

    emitter.emit('EVENT');

    expect(wasEmitted).to.be.true;
  })

  it('Should correctly override addListener', () => {
    emitter.addListener('ALT_EVENT', () => console.debug('Hi'));

    expect(emitter.getMaxListeners()).to.be.above(3);

    emitter.removeAllListeners();
  });

  // Not sure how to test for this automatically. Manual observation works, though.
  // it('Should correctly chain calls to addListener', () => {
  //   const fn = () => {};
  //   emitter.on('SOME_EVENT', fn).on('SOME_EVENT_2', fn).on('SOME_EVENT_3', fn);
  // });

  it('Should only expose the listeners that were added externally.', () => {
    const ALT_EVENT = () => console.debug('ALT_EVENT_LISTENER');
    const DEM_EVENT = () => console.debug('DEM_EVENT_LISTENER');

    emitter.addListener(ALT_EVENT.name, ALT_EVENT);
    expect(emitter.listenerCount(ALT_EVENT.name)).to.equal(1);

    emitter.addListener(DEM_EVENT.name, DEM_EVENT);

    expect(emitter.listenerCount(ALT_EVENT.name)).to.equal(1);
    expect(emitter.listenerCount(DEM_EVENT.name)).to.equal(1);

    const altEvents = emitter.listeners(ALT_EVENT.name);
    expect(altEvents).to.not.be.empty;
    console.debug(`Have ${altEvents.length} listeners. Listing:`);
    altEvents.forEach((v) => {
      v();
      console.debug(`"${v.toString()}"`);
    });
    expect(altEvents[0].toString()).to.equal(ALT_EVENT.toString());

    expect(emitter.listeners(ALT_EVENT.name)[0].toString() == ALT_EVENT.toString());
    expect(emitter.listeners(DEM_EVENT.name)[0].toString() == DEM_EVENT.toString());
  });
});