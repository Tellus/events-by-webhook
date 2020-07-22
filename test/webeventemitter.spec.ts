import mocha from 'mocha';
import { expect } from 'chai';
import { WebEventEmitter, IWebEventEmitterOptions, IStatusResponse } from '../src/WebEventEmitter';
import { assert } from 'console';
import Axios from 'axios';
import { SSL_OP_MICROSOFT_BIG_SSLV3_BUFFER } from 'constants';

describe('WebEventEmitter', () => {
  let emitter:WebEventEmitter;
  // Used to increment ports used. Should avoid some port clashes.
  var portCounter:number = 10000;

  // Sane defaults for most "single emitter" test and for the first emitter
  // in multi-emitter tests.
  WebEventEmitter.defaultOptions.httpServer = {
    host: 'localhost',
  }

  function createEmitter():WebEventEmitter {
    return new WebEventEmitter({
      httpServer: {
        port: ++portCounter,
      }
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

  it('Should respond to HTTP requests', async () => {
    emitter.listen();

    const addr = `http://${emitter.options.httpServer?.host}:${emitter.options.httpServer?.port}/status`;

    console.debug(`Attempting to connect to emitter at ${addr}`);

    const statusResult:IStatusResponse = (await Axios.get(addr)).data;

    expect(statusResult.nodeStatus).to.equal('RUNNING');
  });

  it('Should connect to a different emitter and report its address', async () => {
    emitter.listen();
    const bob = new WebEventEmitter({
      connectTo: emitter.address().toString(),
      httpServer: {
        host: 'localhost',
        port: ++portCounter,
      },
    });
    bob.listen();

    const servers = await bob.serverList();

    expect(servers).to.not.be.empty
    expect(servers[0]).to.equal(emitter.address().toString());
  });

  it('Should emit an event to a connected emitter', async () => {
    emitter.listen();
    const bob = new WebEventEmitter({
      connectTo: emitter.address().toString(),
      httpServer: {
        host: 'localhost',
        port: ++portCounter,
      },
    });
    bob.listen();

    var wasEmitted:boolean = false;

    emitter.on('EVENT', () => wasEmitted = true);

    const hadListeners:boolean = await bob.globalEmit('EVENT');

    expect(wasEmitted).to.be.true;
    expect(hadListeners).to.be.true;

    bob.dispose();
  });

  it('Should receive a remote event', async () => {
    emitter.listen();
    const bob = new WebEventEmitter({
      connectTo: emitter.address().toString(),
      httpServer: {
        host: 'localhost',
        port: ++portCounter,
      },
    });
    bob.listen();

    var wasEmitted:boolean = false;

    bob.on('EVENT', () => wasEmitted = true);

    const hadListeners:boolean = await emitter.globalEmit('EVENT');

    expect(wasEmitted).to.be.true;
    expect(hadListeners).to.be.true;

    bob.dispose();
  });

});