<script>
  import { onMount } from "svelte";
  import Modal from "./components/modal.svelte";
  import { ArweaveWebWallet } from "arweave-wallet-connector";

  const pageTransactionIdLoaded = new Event("pageTransactionIdLoaded");
  const walletConnected = new Event("arweaveWalletConnected");
  const walletDisconnected = new Event("arweaveWalletDisconnected");

  const dispatch = (e) => {
    window.dispatchEvent(e);
  };

  const arweave = window.Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
  });

  window.addEventListener("walletConnect", handleClick);

  async function findTransactionId() {
    const owner = document.querySelector('meta[name="author"]').content;
    const query = `
  query {
    transactions(first: 1, 
    owners: ["${owner}"],
    tags: [
      {name: "App-Name", values: ["SmartWeaveContract"]},
      {name: "Type", values: ["PermaWebPage"]},
      {name: "Page-Title", values: ["${document.title}"]}
    ]) {
      edges {
        node {
          id
        }
      }
    }
  }  
    `;
    const { status, data } = await arweave.api.post("graphql", { query });
    if (status === 200) {
      window.transactionId = data.data.transactions.edges[0].node.id;
      transactionId = window.transactionId;
      dispatch(pageTransactionIdLoaded);
    } else {
      window.transactionId = null;
      transactionId = "not found.";
    }
  }
  onMount(findTransactionId);

  let transactionId = "Loading...";
  let connectDialog = false;
  let connectBtnText = "Connect";

  async function handleClick() {
    if (connectBtnText === "Disconnect") {
      await window.arweaveWallet.disconnect();
      connectBtnText = "Connect";
      dispatch(walletDisconnected);
      return;
    }
    connectDialog = true;
  }

  async function arConnect() {
    if (!window.arweaveWallet) {
      window.open("https://arconnect.io", "_blank");
    }
    await arweaveWallet.connect(["ACCESS_ADDRESS", "SIGN_TRANSACTION"]);
    dispatch(walletConnected);
    connectDialog = false;
    connectBtnText = "Disconnect";
  }

  async function walletConnect() {
    const wallet = new ArweaveWebWallet({
      name: "PermaPage: " + document.title,
    });

    wallet.setUrl("arweave.app");
    await wallet.connect();
    dispatch(walletConnected);
    connectDialog = false;
    connectBtnText = "Disconnect";
  }
</script>

<div class="navbar bg-base-100">
  <div class="flex-1">
    <div class="normal-case text-xl">Permapage: {transactionId}</div>
  </div>
  <div class="flex-none">
    <button class="btn btn-primary" on:click={handleClick}
      >{connectBtnText}</button
    >
  </div>
</div>
<Modal open={connectDialog} ok={false}>
  <h2 class="text-lg">Connect Wallet</h2>
  <button
    on:click={() => (connectDialog = false)}
    class="btn btn-sm btn-circle absolute right-2 top-2">✕</button
  >
  <div class="mt-8">
    <ul>
      <li>
        <button on:click={arConnect} class="btn btn-ghost">ArConnect</button>
      </li>
      <li>
        <button on:click={walletConnect} class="btn btn-ghost"
          >Arweave.app</button
        >
      </li>
    </ul>
  </div>
</Modal>
