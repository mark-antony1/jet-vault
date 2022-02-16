import * as anchor from "@project-serum/anchor";
import * as https from "https";
import { TextEncoder } from "util";
import assert from "assert";
import { Exchange, utils as zetaUtils, constants } from "@zetamarkets/sdk";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const UNIX_WEEK: number = 604800; // unix time (seconds)
const SERVER_URL = "server.zeta.markets";

export interface IVaultBumps {
  vault: number;
  vaultAuthority: number;
  redeemableMint: number;
  vaultUsdc: number;
  obligation: number;
}

export interface IEpochTimes {
  startEpoch: anchor.BN;
  endDeposits: anchor.BN;
  startAuction: anchor.BN;
  endAuction: anchor.BN;
  startSettlement: anchor.BN;
  endEpoch: anchor.BN;
  epochCadence: anchor.BN;
}

export function sleep(ms) {
  console.log("Sleeping for", ms / 1000, "seconds");
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper function to make the post request to server to mint devnet dummy USDC collateral
export async function mintUsdc(
  userPubkey: anchor.web3.PublicKey,
  amount: number
) {
  const data = new TextEncoder().encode(
    JSON.stringify({
      key: userPubkey.toString(),
      amount: amount,
    })
  );
  const options = {
    hostname: `${SERVER_URL}`,
    port: 443,
    path: "/faucet/USDC",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk.toString()));
      res.on("error", reject);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode <= 299) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body,
          });
        } else {
          reject(
            "Request failed. status: " + res.statusCode + ", body: " + body
          );
        }
      });
    });
    req.on("error", reject);
    req.write(data, "binary");
    req.end();
  });
}

export function getClosestMarket(
  exchange: typeof Exchange, // TODO: change this to Market[] when sdk 0.8.3 released
  delta: number,
  expiry: number = UNIX_WEEK
) {
  assert(exchange.isInitialized);
  assert(delta >= 0 && delta <= 1);
  // Find closest expiry
  let closestExpiry = exchange.markets.expirySeries.sort((a, b) => {
    return Math.abs(expiry - a.expiryTs) - Math.abs(expiry - b.expiryTs);
  })[0];

  // Find closest strike to 5-delta
  let head = closestExpiry.expiryIndex * constants.NUM_STRIKES;
  let greeksForClosestExpiry = exchange.greeks.productGreeks.slice(
    head,
    head + constants.NUM_STRIKES
  );
  let closestPutDeltaIndex = greeksForClosestExpiry // get only greeks for this strike
    .reduce(
      (iMin, x, i, arr) =>
        Math.abs(
          delta -
            zetaUtils.convertNativeBNToDecimal(
              x.delta,
              constants.PRICING_PRECISION
            )
        ) <
        Math.abs(
          delta -
            zetaUtils.convertNativeBNToDecimal(
              arr[iMin].delta,
              constants.PRICING_PRECISION
            )
        )
          ? i
          : iMin,
      0
    );
  assert(
    closestPutDeltaIndex >= 0 && closestPutDeltaIndex < constants.NUM_STRIKES
  );

  let market = exchange.markets.getMarketsByExpiryIndex(
    closestExpiry.expiryIndex
  )[constants.NUM_STRIKES + closestPutDeltaIndex];
  assert(market !== undefined);

  console.log(
    `Closest market found: Expiry ${new Date(
      market.expirySeries.expiryTs * 1000
    )}, Strike ${market.strike} (Delta ${zetaUtils.convertNativeBNToDecimal(
      greeksForClosestExpiry[closestPutDeltaIndex].delta,
      constants.PRICING_PRECISION
    )}), Kind ${market.kind}`
  );

  return market;
}

const buildFaucetAirdropIx = async (
  amount: anchor.BN,
  tokenMintPublicKey: anchor.web3.PublicKey,
  destinationAccountPubkey: anchor.web3.PublicKey,
  faucetPubkey: anchor.web3.PublicKey
) => {

  const FAUCET_PROGRAM_ID = new anchor.web3.PublicKey(
    "4bXpkKSV8swHSnwqtzuboGPaPDeEgAn4Vt8GfarV5rZt"
  );

  const pubkeyNonce = await anchor.web3.PublicKey.findProgramAddress([new TextEncoder().encode("faucet")], FAUCET_PROGRAM_ID);

  const keys = [
    { pubkey: pubkeyNonce[0], isSigner: false, isWritable: false },
    {
      pubkey: tokenMintPublicKey,
      isSigner: false,
      isWritable: true
    },
    { pubkey: destinationAccountPubkey, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: faucetPubkey, isSigner: false, isWritable: false }
  ];

  return new anchor.web3.TransactionInstruction({
    programId: FAUCET_PROGRAM_ID,
    data: Buffer.from([1, ...amount.toArray("le", 8)]),
    keys
  });
};

export const jetMetadata = {
  "address": "JPv1rCqrhagNNmJVM5J1he7msQ5ybtvE1nNuHpDHMNU",
  "serumProgramId": "DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY",
  "cluster": "https://psytrbhymqlkfrhudd.dev.genesysgo.net:8899/",
  "market": {
    "market": "2mt2XQS6kKgkE2MPR9fFoWDv5ZYYNXkVGxgg9c9jMPRU",
    "marketAuthority": "iJQtCQKcUusrscfCamXBMgM1fEqqnKfcW5ajkCxVVQF"
  },
  "reserves": [
    {
      "accounts": {
        "reserve": "9rW43cufEHdoVXCQUkvtDhC1UD7egcXnnqKBeFLNUwJ5",
        "vault": "FsUuoYKqoJkMbaffgmT66tNELuAaYJ2yeZrg6pwfhuv9",
        "feeNoteVault": "EFHfUVrcfjnigg2RP4d3fxaxvmXPxBkWZFAy9kxReopa",
        "dexOpenOrders": "33rUUzP3uKZ4ktR2Je98KpVT5nKJCtHR6mUgF8rhGZ4e",
        "dexSwapTokens": "D2mMkcCnYdDgugLo8ViPjykAXqeykAUXxNMcjXrbVHC8",
        "tokenMint": "DNmMghqjvHPuW7DLJkTF6QnTN3xgqDqL6VRXEQdF3KjK",
        "dexMarket": "7UETfWopH1dRgXuVHJKZVu5T74SGj1c4Mm4BU8SJmWyE",
        "pythPrice": "5SSkXsEKQepHHAewytPVwdej4epN1nxgLVM84L4KXgy7",
        "pythProduct": "6NpdXrQEpmDZ3jZKmM2rhdmkd3H6QAk23j2x8bkXcHKA",
        "depositNoteMint": "2RK52k2AGUbwduqDBmhwuVnW8bbTveUxPqLZQuzicVze",
        "loanNoteMint": "BWurTfHzZEtzQ5eFu5ZRQ1K25Gab6sZEBaUqdfZqaXy1",
        "faucet": "9BADYvZDaFBsGbeQEGeTQ9jBopLtd9fTKrycdjBXm7mZ"
      },
      "bump": {
        "vault": 255,
        "feeNoteVault": 255,
        "dexOpenOrders": 255,
        "dexSwapTokens": 255,
        "depositNoteMint": 254,
        "loanNoteMint": 253
      },
      "name": "USDC",
      "abbrev": "USDC",
      "decimals": 6,
      "reserveIndex": 0
    }
  ]
}