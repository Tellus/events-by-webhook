# events-by-webhook

## Introduction

A small library to emit and receive events through webhooks (i.e. endpoints on a web server), built predominantly using Koajs, Axios, and Node's EventEmitter.

This library is **by no means** meant to replace or compete with solid message passing and distribution frameworks. If you need large-scale and highly robust solution I recommend alternatives such as RabbitMQ or Kafka.

Instead, this library is intended to work in small self-contained solutions, where you'd rather not set up an entirely different system for the purposes of passing event messages back and forth between related processes, but in-process event handling isn't possible. There is no error handling or crash recovery, although it should be easy to integrate if you need it.

## Installation

Using your favourite Node package manager:

```npm install --save @specialminds/events-by-webhook```

```yarn add @specialminds/events-by-webhook```

## Usage

### Centralized (one central, one or more leafs)

Assume a central process server running on "CENTRAL" and a leaf running on "LEAF".

On your central (federated) process:
```typescript
import WebEventEmitter from '@specialminds/events-by-webhook';

const emitter = new WebEventEmitter({
  host: "CENTRAL",
});

// Start listening on the endpoint for incoming requests.
emitter.listen();

emitter.on('some_event', () => console.debug('Some event happened!'));

emitter.emit('an_event_from_central');

```

On your leaf ("LEAF") process:

```typescript

import WebEventEmitter from '@specialminds/events-by-webhook';

const emitter = new WebEventEmitter({
  host: "LEAF",
  connectTo: "http://CENTRAL:8080",
});

// Allows CENTRAL to propagate events to LEAF.
emitter.listen();

emitter.on('an_event_from_central', () => console.debug('CENTRAL sent an event.'));

// Send a 'some_event' event to CENTRAL. It will be propagated to any others.
emitter.emit('some_event');

```

On a secondary leaf ("LEAF2"):

```typescript

import WebEventEmitter from '@specialminds/events-by-webhook';

const emitter = new WebEventEmitter({
  host: "LEAF2",
  connectTo: "http://CENTRAL:8080",
});

emitter.on('some_event', () => console.debug('LEAF2 saw some event!'));

```

CENTRAL and LEAF2 should print
```
Some event happened!
```

while LEAF should print
```
CENTRAL sent an event.
```

*Note: due to the unreliable timing of process execution and data transmission, the order of events may be wrong or an event might not be "seen" because the listener wasn't registered before the emission. The code examples show the PRINCIPLE of setting up the system, not a solid working example :-)*

### Replacing EventEmitter.

`WebEventEmitter` can be used as a drop-in replacement of `EventEmitter`. Only the initialization and active destruction (call to `WebEventEmitter.close()`) differ.

In this sense, you can drop in `WebEventEmitter` immediately, and configure the construction once the rest of your architecture changes to fit.

Note that there is *no* functional difference between a null-configured `WebEventEmitter` and `EventEmitter`, except for the overhead of the extra code in `WebEventEmitter`.

## Building and testing

`yarn run build-dist` for building from source, `yarn run test` to run the test suite. The final final files are put in `./dist`.

## Typescript

The library comes with its own Typescript definitions (heck, it's **written** in Typescript!), so you won't need any from DefinitelyTyped.