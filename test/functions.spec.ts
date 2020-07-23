'use strict';

import 'mocha';
import { expect } from 'chai';
import { isIWebHookEvent } from '../src/Util';

describe('isIWebHookEvent', () => {
  // Shorthand functions. We use this structure so often we might as well shorten it.
  
  function doAssertTrue(obj:any): void {
    expect(isIWebHookEvent(obj)).to.be.true;
  }

  function doAssertFalse(obj:any): void {
    expect(isIWebHookEvent(obj)).to.be.false;
  }

  it('Should correctly identify badly formatted objects', () => {
    doAssertFalse({
      symbol: true,
    });

    doAssertFalse({
      symbol: false,
    });

    doAssertFalse({
    });

    doAssertFalse({
      args: {},
    });

    doAssertFalse({
      event: 17,
      symbol: 'REGISTRY',
      args: 'BAD',
    });
  });

  it('Should allow objects with too many members', () => {
    doAssertTrue({
      event: 'MyEvent',
      symbol: true,
      unexpected: 'member',
    });
  });

  it('Should identify a correctly formatted object', () => {
    doAssertTrue({
      event: 'MyEvent',
      symbol: false,
      args: {}
    });

    doAssertTrue({
      event: 'MyEvent',
      symbol: true,
      args: {}
    });

    doAssertTrue({
      event: 'MyEvent',
      args: {}
    });

    doAssertTrue({
      event: 'MyEvent',
      symbol: false,
    });

    doAssertTrue({
      event: 'MyEvent',
      symbol: true,
    });

    doAssertTrue({
      event: 'MyEvent',
    });
  });
});