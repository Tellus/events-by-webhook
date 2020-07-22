# WHEE (WebHook EventEmitter)

## Introduction

A small library to emit and receive events through webhooks (i.e. endpoints on a web server), built predominantly using Koajs, Axios, and Node's EventEmitter.

This library is **by no means** meant to replace or compete with solid message passing and distribution frameworks. If you need large-scale and highly robust solution I recommend alternatives such as RabbitMQ or Kafka.

Instead, this library is intended to work in small self-contained solutions, where you'd rather not set up an entirely different system for the purposes of passing event messages back and forth between related processes, but in-process event handling isn't possible. There is no error handling or crash recovery, although it should be easy to integrate if you need it.

The initial implementation does NOT have anything nifty like error correction, topology reconstruction, zeroconf, or distributed event propagation. Let's leave that for a full v1 or v2 release.

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

setInterval(() => emitter.emit('an_event_from_central'), 3000);

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
setInterval(() => emitter.emit('some_event'), 3000);

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

CENTRAL and LEAF2 should repeatedly print
```
Some event happened!
```

while LEAF should repeatedly print
```
CENTRAL sent an event.
```

### An important note regarding Symbols

Symbols were introduced in ES6 and allows you to create guaranteed unique identifiers. Symbols support the notion of a registry where you can look up and use a Symbol across an entire application process. *For this specific purpose, Symbols cannot be used between processes*, and for the same reason, they cannot be transferred over the web and perfectly retain their meaning.

When adding listeners or emitting events named by Symbol (and not a string), locally, WebEventEmitter will treat them as-is. It will not modify Symbols that you use. When receiving Symbols from other emitters, however, their string value is used to retrieve (or create) a Symbol in the local process' registry. For this reason, it is recommended that you use the registry for your symbols if you use them for events.

An example between two WebEventEmitters. We're skipping configuration for sake of brevity, but assume that the two emitters are running in two different processes.

```typescript
// In process A
const alice = new WebEventEmitter(...);
// In process B
const bob = new WebEventEmitter(...);

// Add an event listener for the event identified uniquely by Symbol('clark').
alice.on(Symbol('clark'), () => { /* Do something */ });

// Emit an event unique identified by Symbol('clark').
bob.emit(Symbol('clark'))
```

`alice` will probably not fire on the event because the unique identifier given by the local Symbol('clark') is quite possibly *different* from the unique identifier given by Symbol('clark') on process B. To mitigate this, WebEventEmitter will always use the registry to retrieve a symbol for a value when receiving an *external* event emission. Instead, do this:

```typescript
alice.on(Symbol.for('clark'), () => { /* Do something */ });
```

When emitting the event `Symbol('clark')` across the network, it is serialized as "Symbol(clark)" and deserialized using `Symbol.for('clark')`. Thus, a receiving WebEventEmitter will always get a symbol from the registry when a Symbol event is received. For ease of use, it's recommened you use `Symbol.for()` whenever possible when using Symbols to identify events.

### Replacing EventEmitter

`WebEventEmitter` can be used as a drop-in replacement of `EventEmitter`. Only the initialization and active destruction (call to `WebEventEmitter.close()`) differ.

In this sense, you can drop in `WebEventEmitter` immediately, and configure the construction once the rest of your architecture changes to fit.

Note that there is *no* functional difference between a null-configured `WebEventEmitter` and `EventEmitter`, except for the overhead of the extra code in `WebEventEmitter`.

## Building and testing

`yarn run build-dist` for building from source, `yarn run test` to run the test suite. The final final files are put in `./dist`.

## Typescript

The library comes with its own Typescript definitions (heck, it's **written** in Typescript!), so you won't need any from DefinitelyTyped.

## Wishlist

Stuff we'd like to add down the road:

#### Self-healing topology

The network's design relies on one or more central servers relaying information throughout the network. What happens if central servers disappear?

#### ZeroConf

It's impossible to set up ZeroConf on solutions running on the internet, but for LAN setups, using libs for it.

#### Distributed event propagation

Having central nodes propagate all events is a clear bottleneck. If the propagation task is distributed evenly throughout, propagation capacity increases markedly.

#### Websockets for servers without addresses

For servers without an externally accessible endpoint, websockets would allow those servers to access servers *with* endpoints, allowing two-way communication. There are other solutions to this, but websockets would re-use the Http transports that are already in use.