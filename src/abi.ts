import { parseAbi, parseAbiItem, toEventSelector, toFunctionSelector } from "viem";
import { contractErrorsAbi } from "@somnia-chain/markets-sdk";

/** The leader signal. Pinned topic0 in CLAUDE.md. */
export const positionUpdatedEvent = parseAbiItem(
  "event PositionUpdated(address indexed account, address indexed perpPool, int128 newSize, uint128 avgEntryPrice, int256 realizedPnl, int256 entryFundingIndex)",
);
export const POSITION_UPDATED_TOPIC = toEventSelector(positionUpdatedEvent);

/** What a linked bot key may call on a perp pool for its owner. */
export const operatorAbi = [
  ...parseAbi([
    "function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)",
    "function cancelOrderFor(address owner, uint128 orderId)",
    "function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)",
  ]),
  // Named pool errors, so a simulation failure says ImmediateOrCancelNoFill rather than 0xd48c4403.
  ...contractErrorsAbi,
] as const;

export const PLACE_ORDER_FOR = toFunctionSelector(
  "placeOrderFor(address,bool,uint64,uint256,uint256,uint64,uint8,uint8,address,uint96)",
);

/** Registry write an EOA owner uses to admit a bot key on every pool (the app's Link a Bot does this for app wallets). */
export const registryAbi = parseAbi([
  "function setOperatorApprovalGlobal(address operator, bytes4[] selectors, bool approved)",
  "function setOperatorApprovalForPool(address pool, address operator, bytes4[] selectors, bool approved)",
]);

/** Multicall3 is deployed on Hideki at the canonical address. Reactivity runs these in the event's block. */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
export const multicallAbi = parseAbi([
  "function getBlockNumber() view returns (uint256)",
  "function getCurrentBlockTimestamp() view returns (uint256)",
]);
