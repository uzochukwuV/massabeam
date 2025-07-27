import 'dotenv/config';
import {
  Account,
  Args,
  Mas,
  SmartContract,
  JsonRpcProvider,
  bytesToStr,
  
} from '@massalabs/massa-web3';
import { getScByteCode } from './utils';

const account = await Account.fromEnv();
console.log('Using account:', account.publicKey.toString());
const provider = JsonRpcProvider.buildnet(account);

console.log('Deploying contract...');

const byteCode = getScByteCode('build', 'massa_beam.wasm');

const name = 'MassaCoin';
const constructorArgs = new Args()
// .addString(name).addString('MSC').addU8(BigInt(18)).addU256(Mas.fromString('10000000000'));

const contract = await SmartContract.deploy(
  provider,
  byteCode,
  constructorArgs,
  { coins: Mas.fromString('0.11') },
);


// beam_usdt = AS1GrZXNAdVUtCbWC3FE3kajmaEg6FxiE9cxQuYBM3KQELGjEE31
// beamusdc =AS1xs2KfX3LVeFoF3v8PQZ8TTWsFAW3UYz1Wkg8358DcakPguWs9

// uni_mass= AS12V5z8s2V6QDjrspP7CuCb67PaXmyViXX5p5CSMchwCFiYE1nZJ
// uni_mass_dca=AS1xUUr7bPTA6HGsZL3BBjyTdmmkb8Crjt3p2bRM6H8AioGMpfap
// uni_wmas= AS12TaZdxkbMtPpnXS9FEhM2QZ2VowBB4vg6EtfdpmcF6zwqaJhbW
// uni_usdc= AS12TShb2g2s3hPUUUZVmiXH23DQuKGT6pcLC3ExmTjYuLHC3WSY5

// const data = await contract.read('version', new Args());
// console.log('Balance of deployed contract:', bytesToStr(data.value));

// const d = await contract.read('owner', new Args());
// console.log('Balance of deployed contract:', bytesToStr(d.value));

// await contract.call("mint", new Args().addString(account.address.toString()).addU256(Mas.fromString('10000000000')), { coins: Mas.fromString('0.01') });


console.log('Contract deployed at:', contract.address);

const events = await provider.getEvents({
  smartContractAddress: contract.address,
});

for (const event of events) {
  console.log('Event message:', event.data);
}
