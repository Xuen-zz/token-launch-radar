import type { Protocol } from './model.ts'
import { morphoV2Evidence, productEvidence, routeEvidence } from './evidence.ts'

const routes = [
  {
    category: /curator|capital allocator/i, type: 'Allocator vault review', transactions: 3, frictionBps: 35,
    action: 'Find a public vault attributed to this curator. Verify the vault address and asset, review its lending allocations, and compare withdrawal liquidity with your planned size.',
    exit: 'Redeem shares through the vault or its host protocol. If liquidity is limited, verify the withdrawal queue and pause any top-up.',
  },
  {
    category: /lend|borrow|cdp/i, type: 'Supply and redeem', transactions: 3, frictionBps: 15,
    action: 'Find a supported supply market for an asset you already hold. Check utilization, caps and withdrawals; use supply only. Avoid borrowing and leverage.',
    exit: 'Redeem the supplied balance. If utilization blocks a full withdrawal, document the available liquidity and avoid adding collateral.',
  },
  {
    category: /\bdexs?\b|stable swap|\bamm\b|\bspot\b/i, type: 'Small swap round trip', transactions: 3, frictionBps: 65,
    action: 'Inspect a liquid spot route for two assets you already use. Preview both directions and save the fee and price impact before deciding on the first swap.',
    exit: 'Preview and execute the reverse swap only if the quote meets your planned friction limit. Log the difference between the two quotes.',
  },
  {
    category: /yield|vault|farm/i, type: 'Vault deposit and redemption', transactions: 3, frictionBps: 35,
    action: 'Open a supported vault and check its underlying strategy, fee schedule, lockup and redemption queue. Skip deposits if the strategy or exit is unclear.',
    exit: 'Redeem vault shares after the documented waiting period. Record the fill, redemption fees and any principal still locked.',
  },
  {
    category: /perp|derivative|option|prediction|basis trading/i, type: 'Market review', transactions: 0, frictionBps: 0,
    action: 'Review supported markets, margin requirements and liquidation rules with a read-only account or a documented sandbox.',
    exit: 'Record eligible test activity only if the program expressly accepts it. Stop if eligibility would require leveraged trading.',
  },
  {
    category: /stablecoin|rwa|real world/i, type: 'Mint and redemption review', transactions: 0, frictionBps: 0,
    action: 'Check minting access, redemption minimums and any identity requirements in the protocol documentation. Review the issuer and collateral.',
    exit: 'Verify that a redemption route actually exists for your jurisdiction and intended size before considering any deposit.',
  },
  {
    category: /collateral|restaking|staking pool|insurance/i, type: 'Collateral and exit review', transactions: 0, frictionBps: 0,
    action: 'Find a named pool and identify the deposited asset, receipt token and operator. Review slashing, exclusions and which entity controls withdrawals.',
    exit: 'Record the unbonding delay, any withdrawal claim transaction and the conditions under which principal can be impaired.',
  },
]
const gasScenarios: Record<string, number> = {
  ethereum: 5, arbitrum: .25, base: .20, optimism: .25, solana: .10, polygon: .15,
  bsc: .20, avalanche: .30, sui: .15,
  binance: .20, linea: .25, scroll: .25, ink: .20, monad: .20, unichain: .20,
  mantle: .35, gnosis: .10, sonic: .20, aptos: .15, stellar: .10, algorand: .10,
  berachain: .35, blast: .25, zksync: .25, 'hyperliquid l1': .30, 'plume mainnet': .35,
}
const dollars = (n: number) => '$' + n.toFixed(2)
const round = (n: number) => Math.round(n * 100) / 100

export function farmPlan(p: Protocol) {
  const recordedRoute = routeEvidence[p.slug]
  const evidence = recordedRoute && p.chains.includes(recordedRoute.chain) ? recordedRoute : null
  const related = productEvidence[p.slug]
  const implementation = related?.implementation ?? (evidence?.inspectMorphoV2 ? morphoV2Evidence : null)
  const route = routes.find(r => r.category.test(p.category ?? '')) ?? {
    type: 'Eligibility review', transactions: 0, frictionBps: 0,
    action: 'Identify the main product and check whether public wallet interactions are supported. Start with a read-only walkthrough.',
    exit: 'Write down any published eligibility rules. Keep this protocol on review until the eligible activity and exit are documented.',
  }
  const chain = evidence?.chain ?? [...p.chains].sort((a, b) =>
    (gasScenarios[a.toLowerCase()] ?? Infinity) - (gasScenarios[b.toLowerCase()] ?? Infinity) ||
    (a < b ? -1 : a > b ? 1 : 0))[0] ?? 'Unspecified'
  const gas = gasScenarios[chain.toLowerCase()] ?? null
  const transactions = evidence?.transactions ?? route.transactions
  const canModel = !related && transactions > 0 && gas != null
  const reviewMinutes = related ? 10 : /identity|redemption|collateral|exit/i.test(route.type) ? 30 : 20
  const reviewCost = round(reviewMinutes / 60 * 10)
  const holdDays = !canModel || route.type === 'Small swap round trip' ? 0 : 14
  const scenarios = canModel ? [25, 100, 250].map(capital => {
    const network = transactions * gas!
    const friction = capital * route.frictionBps / 10_000
    const carry = capital * .05 * holdDays / 365
    const time = 15 / 60 * 10
    const cashCost = round(network + friction)
    const total = round(network + friction + carry + time)
    return { capital, network: round(network), friction: round(friction), carry: round(carry), time, cash_cost: cashCost,
      total, award_at_10pct: round(total / .1), award_at_25pct: round(total / .25), award_at_50pct: round(total / .5) }
  }) : []
  const sizes = scenarios.map(s => dollars(s.capital) + ' → ' + dollars(s.total)).join(', ')
  const steps = [
    'Day 0 · Verify ' + p.name + ' in its official documentation. Confirm the deployment on ' + chain + ', contract addresses, supported assets and public eligibility rules.',
    'Day 0 · ' + (related ? related.note + ' Verify the product and token relationship before treating this as a launch lead.' : evidence?.entry ?? route.action),
    canModel
      ? 'Before signing · Replace estimated network and friction costs with live quotes. Modeled capital → total cost: ' + sizes + '. Budget separately for bridging if needed.'
      : 'Review only · Budget ' + reviewMinutes + ' minutes (' + dollars(reviewCost) + ' at $10/hour), $0 capital and $0 network fees. Re-evaluate only when a documented eligible route is available.',
    (!canModel ? 'Before proceeding · ' : holdDays ? 'Exit review by day 14 · ' : 'Same-session exit · ') +
      (related ? 'Record the existing asset and separate evidence, if any, for a distinct future distribution.' : evidence?.exit ?? route.exit),
    ...(implementation ? ['Implementation check · ' + implementation.finding] : []),
    'After review · Keep transaction hashes, fees and capital records. Recheck campaign terms at announcement and remove unused token approvals when appropriate.',
  ]
  return {
    farm_steps: steps,
    farm: { type: related ? 'Existing asset review' : evidence?.title ?? route.type, chain, hold_days: holdDays,
      modeled_transactions: canModel ? transactions : 0, route_source: evidence?.source ?? related?.source ?? null,
      implementation,
      review: canModel ? null : { minutes: reviewMinutes, cost: reviewCost, capital: 0, gas: 0 },
      missing_gas_quote: !related && transactions > 0 && gas == null,
      scenarios, launch_or_award_verified: false },
  }
}
