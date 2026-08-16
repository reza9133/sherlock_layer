# SherlockLayer

A decentralized Mystery & ARG adjudication protocol on GenLayer. Creators open a
Mystery Case with a GEN bounty and a secret solution rubric; Hunters submit an
evidence URL; GenLayer's AI validator consensus reads it and rules SOLVED or
UNSOLVED, paying the bounty out automatically on a solve.

## Project layout

```
contracts/sherlock_layer.py   Intelligent Contract (deploy via GenLayer Studio / CLI)
app/page.jsx                  Main dashboard (wallet, case list, create, solve flow)
app/layout.jsx                Root layout — fonts + globals.css
app/globals.css               Noir/detective theme (Tailwind + custom classes)
utils/client.js                genlayer-js client setup, read/write helpers
```

## 1. Deploy the contract

Using the GenLayer CLI (or GenLayer Studio's UI):

```bash
genlayer network testnet-bradbury
genlayer deploy --contract contracts/sherlock_layer.py
```

Copy the resulting contract address.

## 2. Configure the frontend

```bash
cp .env.local.example .env.local
# edit .env.local and set NEXT_PUBLIC_CONTRACT_ADDRESS
```

## 3. Install & run

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll need a browser wallet (MetaMask) with
Testnet Bradbury added and some testnet GEN — grab it from GenLayer's faucet.

## Notes & caveats

- **Bradbury chain config**: `utils/client.js` tries to import a
  `testnetBradbury` chain from `genlayer-js/chains`. If your installed
  `genlayer-js` version predates that export, it falls back to a
  hand-rolled chain object — double check the `id` / RPC / explorer URLs
  there against the current GenLayer docs before treating it as ground
  truth, since testnet endpoints do move.
- **AI consensus latency**: `submit_evidence` resolves synchronously
  on-chain but can take anywhere from a few seconds to ~90s while
  validators run the LLM evaluation and reach consensus. The UI's
  "Validators are deliberating…" state reflects that wait.
- **Secret criteria aren't encrypted**: GenVM contract storage is public
  chain state. The `solution_criteria` field is simply omitted from every
  view method's return value, which keeps it out of the UI and casual
  block explorers — but it is not cryptographically hidden.
