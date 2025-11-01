Introduction
SDK is an open source library created to help builders interact with the contracts from their JS/TS projects.

This guide endeavors to show examples of how builders can use the SDK, together with massa-web3, to perform a trade, add/remove liquidity, and claim fees.

Installation
Run the following command to add the required dependencies to your project:

npm install @dusalabs/sdk @massalabs/massa-web3

Classes
SDK implements 4 main classes: PairV2, RouteV2, TradeV2, and Bin. Specific documentation of the fields and functions for each class can be found in the code.

PairV2
RouteV2
TradeV2
Bin
Github
SDK uses Github to track issues and feature requests. Please open an issue if you have found a bug or have new feature requests. We also welcome contributions from the open source community. Open a pull request with a detailed explanation and the team will gladly review your contribution.


Making a Trade
This guide demonstrates how to execute a swap. In this example, we will be swapping 20 USDC for WETH.

1. Required imports for this guide
import {
  ChainId,
  IERC20,
  IRouter,
  LB_ROUTER_ADDRESS,
  Percent,
  TokenAmount,
  DAI as _DAI,
  USDC as _USDC,
  WETH as _WETH,
  WMAS as _WMAS,
  parseUnits,
  QuoterHelper
} from '@dusalabs/sdk'
import { Account, Web3Provider } from '@massalabs/massa-web3'

2. Declare required constants
const logEvents = (client: Web3Provider, txId: string): void => {
  client
    .getEvents({ operationId: txId })
    .then((r) => r.forEach((e) => console.log(e.data)))
}

const createClient = async (baseAccount: Account, mainnet = false) =>
  mainnet
    ? Web3Provider.mainnet(baseAccount)
    : Web3Provider.buildnet(baseAccount)

const privateKey = process.env.PRIVATE_KEY
if (!privateKey) throw new Error('Missing PRIVATE_KEY in .env file')
const account = await Account.fromPrivateKey(privateKey)
if (!account.address) throw new Error('Missing address in account')
const client = await createClient(account)

const CHAIN_ID = ChainId.BUILDNET
const router = LB_ROUTER_ADDRESS[CHAIN_ID]

Note that in your project, you most likely will not hardcode the private key at any time. You would be using libraries like wallet-provider to connect to a wallet, sign messages, interact with contracts, and get the above constants.

// initialize tokens
const WMAS = _WMAS[CHAIN_ID];
const USDC = _USDC[CHAIN_ID];
const WETH = _WETH[CHAIN_ID];

3. Declare user inputs and initialize TokenAmount
// the input token in the trade
const inputToken = WMAS;

// the output token in the trade
const outputToken = WETH;

// specify whether user gave an exact inputToken or outputToken value for the trade
const isExactIn = true;

// user string input; in this case representing 20 USDC
const typedValueIn = "20";

// parse user input into inputToken's decimal precision, which is 6 for USDC
const typedValueInParsed = parseUnits(typedValueIn, inputToken.decimals).toString(); // returns 20000000

// wrap into TokenAmount
const amountIn = new TokenAmount(inputToken, typedValueInParsed);

const maxHops = 3

4. Get the best trade
const isNativeIn = true;   // set to 'true' if swapping from MAS; otherwise, 'false'
const isNativeOut = false; // set to 'true' if swapping to MAS; otherwise, 'false'

const bestTrade = await QuoterHelper.findBestPath(
    inputToken,
    isNativeIn,
    outputToken,
    isNativeOut,
    amountIn,
    isExactIn,
    maxHops,
    client,
    CHAIN_ID
  )

6. Check trade information
// print useful information about the trade, such as the quote, executionPrice, fees, etc
console.log(bestTrade.toLog());

if (!bestTrade || !executeSwap) return

// get trade fee information
const { totalFeePct, feeAmountIn } = bestTrade.getTradeFee();
console.log("Total fees percentage", totalFeePct.toSignificant(6), "%");
console.log(`Fee: ${feeAmountIn.toSignificant(6)} ${feeAmountIn.token.symbol}`);

7. Declare slippage tolerance and swap method/parameters
// set slippage tolerance
const userSlippageTolerance = new Percent(1n, 100n); // 1%

// generate swap method and parameters for contract call
const params = bestTrade.swapCallParameters({
    ttl: 1000 * 60 * 10, // 10 minutes
    recipient: account.address.toString(),
    allowedSlippage: userSlippageTolerance
  })

8. Execute trade using massa-web3
// increase allowance for the router (not needed if inputToken is MAS)
const txIdAllowance = await new IERC20(inputToken.address, client).approve(
  router,
  bestTrade.inputAmount.raw
)

if (txIdAllowance) {
  console.log('txIdAllowance', txIdAllowance)
  await txIdAllowance.waitSpeculativeExecution()
  logEvents(client, txIdAllowance.id)
}

// execute swap
const txId = await new IRouter(router, client).swap(params)
console.log('txId', txId.id)

// await tx confirmation and log events
await txId.waitSpeculativeExecution()
await client
  .smartContracts()
  .getFilteredScOutputEvents({
    emitter_address: null,
    start: null,
    end: null,
    original_caller_address: null,
    is_final: null,
    original_operation_id: txId,
  })
  .then((r) => 
    r.forEach(({data}) => {
      if (data.startsWith("SWAP:")) console.log(EventDecoder.decodeSwap(data));
      else console.log(data);
    });
  );




  Adding Liquidity
This guide shows how to add liquidity into a pool using the SDK and massa-web3. In this example, we will be adding 20 USDC and 5 WMAS into a Pair of USDC/WMAS/20bps

1. Required imports for this guide
import {
  ChainId,
  IERC20,
  IRouter,
  LB_ROUTER_ADDRESS,
  LiquidityDistribution,
  PairV2,
  TokenAmount,
  WMAS as _WMAS,
  USDC as _USDC,
  parseUnits,
  Percent,
  ILBPair
} from '@dusalabs/sdk'
import { Account, Web3Provider } from '@massalabs/massa-web3'

2. Declare required constants

const logEvents = (client: Web3Provider, txId: string): void => {
  client
    .getEvents({ operationId: txId })
    .then((r) => r.forEach((e) => console.log(e.data)))
}

const createClient = async (baseAccount: Account, mainnet = false) =>
  mainnet
    ? Web3Provider.mainnet(baseAccount)
    : Web3Provider.buildnet(baseAccount)

const privateKey = process.env.PRIVATE_KEY
if (!privateKey) throw new Error('Missing PRIVATE_KEY in .env file')
const account = await Account.fromPrivateKey(privateKey)
if (!account.address) throw new Error('Missing address in account')
const client = await createClient(account)
const CHAIN_ID = ChainId.BUILDNET

Note that in your project, you most likely will not hardcode the private key at any time. You would be using libraries like wallet-provider to connect to a wallet, sign messages, interact with contracts, and get the above constants.

// initialize tokens
const WMAS = _WMAS[CHAIN_ID];
const USDC = _USDC[CHAIN_ID];

const router = LB_ROUTER_ADDRESS[CHAIN_ID];

3. Declare user inputs and initialize TokenAmount
// user string input; in this case representing 20 USDC and 20 WMAS
const typedValueUSDC = '20'
const typedValueWMAS = '20'

// parse user input into decimal precision, which is 6 for USDC and 9 for WMAS
const tokenAmountUSDC = new TokenAmount(USDC, parseUnits(typedValueUSDC, USDC.decimals));
const tokenAmountWMAS = new TokenAmount(WMAS, parseUnits(typedValueWMAS, WMAS.decimals));

// set amount slippage tolerance
const allowedAmountSlippage = 50; // in bips, 0.5% in this case

// set price slippage tolerance
const allowedPriceSlippage = 50; // in bips, 0.5% in this case

// set deadline for the transaction
const currentTimeInMs = new Date().getTime();
const deadline = currentTimeInMs + 3_600_000;

4. Get the LBPair's active bin
const pair = new PairV2(USDC, WMAS);
const binStep = 20;
const lbPair = await pair.fetchLBPair(binStep, client, CHAIN_ID);
const lbPairData = await new ILBPair(lbPair.LBPair, client).getReservesAndId();

5. Get addLiquidity parameters
const addLiquidityInput = await pair.addLiquidityParameters(
  lbPair.LBPair,
  binStep,
  tokenAmountUSDC,
  tokenAmountWMAS,
  new Percent(BigInt(allowedAmountSlippage), 10_000n),
  new Percent(BigInt(allowedPriceSlippage), 10_000n),
  LiquidityDistribution.SPOT,
  client
);

const params = pair.liquidityCallParameters({
  ...addLiquidityInput,
  activeIdDesired: lbPairData.activeId,
  to: account.address.toString(),
  deadline,
});

6. Execute contract call
// increase allowance for the router
const approveTxId1 = await new IERC20(USDC.address, client).approve(router, tokenAmountUSDC.raw);
const approveTxId2 = await new IERC20(WMAS.address, client).approve(router, tokenAmountWMAS.raw);

if (approveTxId1) await approveTxId1.waitSpeculativeExecution()
if (approveTxId2) await approveTxId2.waitSpeculativeExecution()

// add liquidity
const txId = await new IRouter(router, client).add(params);
console.log("txId", txId);

// await transaction confirmation and log output events
await txId.waitSpeculativeExecution()
await client
  .smartContracts()
  .getFilteredScOutputEvents({
    emitter_address: null,
    start: null,
    end: null,
    original_caller_address: null,
    is_final: null,
    original_operation_id: txId,
  })
  .then((r) =>
    r.forEach(({ data }) => {
      if (data.startsWith("DEPOSITED_TO_BIN:")) console.log(EventDecoder.decodeLiquidity(data));
      else console.log(data);
    })
  );

Edit this page


Removing Liquidity
This guide shows how to remove liquidity from a pool using the SDK and massa-web3. In this example, we will be removing liquidity from a LBPair of USDC/WMAS/20bps

1. Required imports for this guide
import {
  ChainId,
  IERC20,
  IRouter,
  LB_ROUTER_ADDRESS,
  LiquidityDistribution,
  PairV2,
  TokenAmount,
  WMAS as _WMAS,
  USDC as _USDC,
  parseUnits,
  Percent,
  ILBPair
} from '@dusalabs/sdk'
import { Account, Web3Provider } from '@massalabs/massa-web3'

2. Declare required constants
const logEvents = (client: Web3Provider, txId: string): void => {
  client
    .getEvents({ operationId: txId })
    .then((r) => r.forEach((e) => console.log(e.data)))
}

const createClient = async (baseAccount: Account, mainnet = false) =>
  mainnet
    ? Web3Provider.mainnet(baseAccount)
    : Web3Provider.buildnet(baseAccount)

const privateKey = process.env.PRIVATE_KEY
if (!privateKey) throw new Error('Missing PRIVATE_KEY in .env file')
const account = await Account.fromPrivateKey(privateKey)
if (!account.address) throw new Error('Missing address in account')
const client = await createClient(account)
const CHAIN_ID = ChainId.BUILDNET

Note that in your project, you most likely will not hardcode the private key at any time. You would be using libraries like wallet-provider to connect to a wallet, sign messages, interact with contracts, and get the above constants.

// initialize tokens
const WMAS = _WMAS[CHAIN_ID];
const USDC = _USDC[CHAIN_ID];

const router = LB_ROUTER_ADDRESS[CHAIN_ID];

3. Getting data
LBPair and active bin
const pair = new PairV2(USDC, WMAS);
const binStep = 20;
const lbPair = await pair.fetchLBPair(binStep, client, CHAIN_ID);
const pairAddress = lbPair.LBPair;
const pairContract = new ILBPair(pairAddress, client);
const lbPairData = await pairContract.getReservesAndId();
const tokens = await pairContract.getTokens()
const activeBinId = lbPairData.activeId;

Liquidity positions
const userPositionIds = await pairContract.getUserBinIds(address);
const addressArray = Array.from({ length: userPositionIds.length }, () => address);
const bins = await pairContract.getBins(userPositionIds);

const allBins = await pairContract.balanceOfBatch(addressArray, userPositionIds);
const nonZeroAmounts = allBins.filter((amount) => amount !== 0n);
const totalSupplies = await pairContract.getSupplies(userPositionIds);

4. Grant LBRouter access to your LBTokens
const approved = await pairContract.isApprovedForAll(address, router);
if (!approved) {
  const txIdApprove = await pairContract.setApprovalForAll(router, true);
  console.log("txIdApprove", txIdApprove);
}

5. Set removeLiquidity parameters
const currentTimeInMs = new Date().getTime();
const deadline = currentTimeInMs + 3_600_000;

// set amount slippage tolerance
const allowedAmountSlippage = 50; // in bips, 0.5% in this case

const removeLiquidityInput = pair.calculateAmountsToRemove(
  userPositionIds,
  activeBinId,
  bins,
  totalSupplies,
  nonZeroAmounts.map(String),
  new Percent(BigInt(allowedAmountSlippage), 10_000n)
);

const params = pair.liquidityCallParameters({
  ...removeLiquidityInput,
  amount0Min: removeLiquidityInput.amountXMin,
  amount1Min: removeLiquidityInput.amountYMin,
  ids: userPositionIds,
  amounts: nonZeroAmounts,
  token0: tokens[0],
  token1: tokens[1],
  binStep,
  to: address,
  deadline,
});

6. Execute contract call
const txId = await new IRouter(router, client).remove(params);
console.log("txId", txId);

// await transaction confirmation and log output events
await txId.waitSpeculativeExecution()
await client
  .smartContracts()
  .getFilteredScOutputEvents({
    emitter_address: null,
    start: null,
    end: null,
    original_caller_address: null,
    is_final: null,
    original_operation_id: txId,
  })
  .then((r) =>
    r.forEach(({ data }) => {
      if (data.startsWith("WITHDRAWN_FROM_BIN:")) console.log(EventDecoder.decodeLiquidity(data));
      else console.log(data);
    })
  );