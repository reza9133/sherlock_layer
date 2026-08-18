 * utils/client.js

 * ---------------------------------------------------------------------

 * genlayer-js setup + explicit read/write helpers for the SherlockLayer

 * Intelligent Contract.

 *

 * RULE 4 (wallet integration): multi-provider conflicts (MetaMask fighting

 * Coinbase Wallet / Phantom / Rabby for `window.ethereum`) are handled by

 * always resolving the injected provider through:

 *     window.ethereum?.providers?.find(p => p.isMetaMask) || window.ethereum

 *

 * NOTE on Testnet Bradbury: as of writing, GenLayer has moved from Testnet

 * Asimov to Testnet Bradbury (docs.genlayer.com / explorer-bradbury.genlayer.com).

 * Newer genlayer-js releases export a ready-made `testnetBradbury` chain from

 * 'genlayer-js/chains'. If your installed version predates that export, the

 * fallback chain object below kicks in automatically — just confirm its

 * `id` / rpcUrls / blockExplorers against https://docs.genlayer.com before

 * you rely on it for anything real, since testnet infra details do shift.

 */



import { createClient, createAccount } from 'genlayer-js';

import * as genlayerChains from 'genlayer-js/chains';

import { ethers } from 'ethers';



// ---------------------------------------------------------------------

// Chain resolution

// ---------------------------------------------------------------------



const FALLBACK_BRADBURY_CHAIN = {

  id: 4221, // TODO: verify against `genlayer network testnet-bradbury` / docs.genlayer.com

  name: 'GenLayer Testnet Bradbury',

  network: 'genlayer-testnet-bradbury',

  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },

  rpcUrls: {

    default: { http: ['https://bradbury.genlayer.com/api'] },

    public: { http: ['https://bradbury.genlayer.com/api'] },

  },

  blockExplorers: {

    default: {

      name: 'GenLayer Explorer (Bradbury)',

      url: 'https://explorer-bradbury.genlayer.com',

    },

  },

  testnet: true,

};



export const bradburyChain = genlayerChains.testnetBradbury ?? FALLBACK_BRADBURY_CHAIN;



export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x9cc3525CcD1307e9D9f2a771aC9Cfe2e2868ae1a';


// ---------------------------------------------------------------------

// RULE 4 — multi-provider-safe wallet resolution

// ---------------------------------------------------------------------



export function getInjectedProvider() {

  if (typeof window === 'undefined') return null;

  return window.ethereum?.providers?.find((p) => p.isMetaMask) || window.ethereum || null;

}



export async function connectWallet() {

  const provider = getInjectedProvider();

  if (!provider) {

    throw new Error('No injected wallet found. Install MetaMask to use SherlockLayer.');

  }



  const accounts = await provider.request({ method: 'eth_requestAccounts' });

  if (!accounts || accounts.length === 0) {

    throw new Error('Wallet connection was rejected or returned no accounts.');

  }



  await ensureBradburyNetwork(provider);

  return accounts[0];

}



async function ensureBradburyNetwork(provider) {

  const targetChainIdHex = '0x' + bradburyChain.id.toString(16);

  try {

    await provider.request({

      method: 'wallet_switchEthereumChain',

      params: [{ chainId: targetChainIdHex }],

    });

  } catch (switchError) {

    // 4902 = chain not added to the wallet yet

    if (switchError?.code === 4902) {

      await provider.request({

        method: 'wallet_addEthereumChain',

        params: [

          {

            chainId: targetChainIdHex,

            chainName: bradburyChain.name,

            nativeCurrency: bradburyChain.nativeCurrency,

            rpcUrls: bradburyChain.rpcUrls.default.http,

            blockExplorerUrls: [bradburyChain.blockExplorers.default.url],

          },

        ],

      });

    } else {

      // Non-fatal: user can still read/write via genlayer-js's own RPC even

      // if their wallet stays pointed elsewhere for signing UI purposes.

      console.warn('Could not switch wallet network automatically:', switchError);

    }

  }

}



// ---------------------------------------------------------------------

// Clients

// ---------------------------------------------------------------------



/** Read-only client — no signer required, safe to use before wallet connect. */

export function getReadClient() {

  return createClient({ chain: bradburyChain });

}



/** Write client — signs through the connected injected wallet (MetaMask etc). */

export function getWriteClient(accountAddress) {

  if (!accountAddress) {

    throw new Error('getWriteClient requires a connected account address.');

  }

  return createClient({ chain: bradburyChain, account: accountAddress });

}



async function waitForReceipt(client, hash) {

  // ACCEPTED = initial validator consensus reached (fast, ~seconds-to-a-

  // couple-minutes depending on network load). FINALIZED additionally waits

  // out the appeal window and takes materially longer — swap in if your UI

  // can afford to wait and you want the strongest guarantee before trusting

  // the result.

  return client.waitForTransactionReceipt({ hash, status: 'ACCEPTED' });

}



// ---------------------------------------------------------------------

// Reads

// ---------------------------------------------------------------------



export async function fetchStats() {

  const client = getReadClient();

  return client.readContract({

    address: CONTRACT_ADDRESS,

    functionName: 'get_stats',

    args: [],

  });

}



export async function fetchCaseCount() {

  const client = getReadClient();

  const count = await client.readContract({

    address: CONTRACT_ADDRESS,

    functionName: 'get_case_count',

    args: [],

  });

  return Number(count);

}



/** RULE 5: paginated read — never fetches the full case map at once. */

export async function fetchCases(offset = 0, limit = 6) {

  const client = getReadClient();

  return client.readContract({

    address: CONTRACT_ADDRESS,

    functionName: 'get_cases',

    args: [offset, limit],

  });

}



export async function fetchCasesByCreator(creatorAddress, offset = 0, limit = 6) {

  const client = getReadClient();

  return client.readContract({

    address: CONTRACT_ADDRESS,

    functionName: 'get_cases_by_creator',

    args: [creatorAddress, offset, limit],

  });

}



export async function fetchCase(caseId) {

  const client = getReadClient();

  return client.readContract({

    address: CONTRACT_ADDRESS,

    functionName: 'get_case',

    args: [caseId],

  });

}



// ---------------------------------------------------------------------

// Writes

// ---------------------------------------------------------------------



/**

 * Opens a new Mystery Case. `bountyGen` is a human-readable GEN amount

 * string (e.g. "0.5"); ethers v5 handles the decimal -> wei conversion.

 */

export async function createCase({ account, title, description, solutionCriteria, bountyGen }) {

  const client = getWriteClient(account);

  const valueWei = BigInt(ethers.utils.parseEther(String(bountyGen)).toString());



  const hash = await client.writeContract({

    address: CONTRACT_ADDRESS,

    functionName: 'create_case',

    args: [title, description, solutionCriteria],

    value: valueWei,

  });



  return waitForReceipt(client, hash);

}



export async function submitEvidence({ account, caseId, evidenceText }) {
  const client = getWriteClient(account);

  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'submit_evidence',
    args: [caseId, evidenceText],
    value: 0,
  });

  return waitForReceipt(client, hash);
}



export async function cancelCase({ account, caseId }) {

  const client = getWriteClient(account);



  const hash = await client.writeContract({

    address: CONTRACT_ADDRESS,

    functionName: 'cancel_case',

    args: [caseId],

    value: 0,

  });



  return waitForReceipt(client, hash);

}

export async function claimBounty({ account, caseId }) {
  const client = getWriteClient(account);

  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'claim_bounty',
    args: [caseId],
    value: 0,
  });

  return waitForReceipt(client, hash);
}

// ---------------------------------------------------------------------

// Formatting helpers (ethers v5)

// ---------------------------------------------------------------------



export function formatGen(weiValue) {

  try {

    return ethers.utils.formatEther(ethers.BigNumber.from(String(weiValue)));

  } catch {

    return '0';

  }

}



export function shortenAddress(address) {

  if (!address) return '';

  return `${address.slice(0, 6)}…${address.slice(-4)}`;

}



// Re-exported for callers that need direct SDK access (e.g. reading raw tx status).

export { createAccount }; 

