# Permapages Connector Widget 

This widget will load the page transactionId and the connect button, the connect button will allow arweave users to connect to interact with other widgets on the page.

## Usage

```html
<div id="widget-connector"></div>
<script src="https://arweave.net/AKCu7H3CEZWJYYIe6Fr9ZBitP4plgObGY1yhrMKj0x0"><script>
```

## Your widget can request a connected wallet by dispatching a `walletConnect` event

This method will prompt the user to connect with a wallet, then once a user is connected it will invoke the `arweaveWalletConnected` event.

Example

```js
const e = new Event("walletConnect");
window.dispatchEvent(e);
```


## How to use in your widget

This widget will set the Permapage ContractId and allow for users to connect to the Permapage to interact with your widget. When the connector finds the contract it will dispatch an event notifying all listeners that the transactionId is set, it will also set the transactionId on the window object. The connector widget also allows users to connect their wallet to the permapage. When they connect or disconnect, this widget will dispatch events. `arweaveWalletConnected` and `arweaveWalletDisconnected` respectively.

Example

```js

window.addEventListener('pageTransactionIdLoaded', () => {
  console.log('Page Contract Id', window.transactionId)
})

window.addEventListener('arweaveWalletConnected', () => {
  console.log('Wallet Connected')
})

window.addEventListener('arweaveWalletDisconnected', () => {
  console.log('Wallet Disconnected')
})

```

## Build Widget

```sh
npm run build
```

## Run Example Server

```sh
npm run example
```

## Deploy to Arweave

```sh
npm run deploy [path to wallet.json]
```

