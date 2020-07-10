import mocha from 'mocha';
import { expect } from 'chai';
import { WebEventEmitter, IWebEventEmitterOptions, IStatusResponse } from '../src/WebEventEmitter';
import { assert } from 'console';
import Axios from 'axios';

describe('WebEventEmitter', () => {
  let emitter:WebEventEmitter;

  // Sane defaults for most "single emitter" test and for the first emitter
  // in multi-emitter tests.
  WebEventEmitter.defaultOptions.httpServer = {
    host: 'localhost',
  }

  beforeEach(() => {
    emitter = new WebEventEmitter();
  });

  afterEach(async () => {
    await emitter?.dispose();
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
});