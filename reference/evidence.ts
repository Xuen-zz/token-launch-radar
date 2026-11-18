type ImplementationEvidence = { source: string; finding: string }

export const productEvidence: Record<string, { note: string; source: string; implementation?: ImplementationEvidence }> = {
  usdd: {
    note: 'USDD is already issued and redeemable. A future, separate governance asset would be a different claim.',
    source: 'docs.usdd.io/system-architecture/system-architecture',
  },
  'bittensor-dtao': {
    note: 'Dynamic TAO uses the existing TAO asset and subnet alpha tokens. The snapshot row represents this mechanism.',
    source: 'guides.learnbittensor.org/learn/emissions',
  },
  'lightning-network': {
    note: 'Lightning settles payments in BTC through payment channels. A separate launch has not been established.',
    source: 'docs.lightning.engineering/lightning-network-tools/lnd/payments',
  },
  b14g: {
    note: 'The product includes dualCORE, a liquid dual-staking token for Core. A distinct future token is unverified.',
    source: 'medium.com/b14g/dualcore-dual-staking-rewards-51793c9748a3',
  },
  saturn: {
    note: 'The product already includes USDat and the yield-bearing sUSDat vault share.',
    source: 'saturncredit.gitbook.io/saturn-docs',
  },
  'mezo-earn': {
    note: 'Mezo Earn uses existing veBTC and veMEZO positions for rewards and governance.',
    source: 'mezo.org/docs/users/mezo-earn/overview',
    implementation: {
      source: 'github.com/DefiLlama/DefiLlama-Adapters/blob/2eb52426fc506794474e4445ae6be08a8f9d0790/projects/mezo-vaults/index.js',
      finding: 'The adjacent Mezo Vaults adapter counts backing assets of the sMUSD savings vault and a Morpho USDC lending vault. It describes adjacent vault TVL, with no basis to infer launch or drop eligibility from that TVL.',
    },
  },
  'reti-pooling': {
    note: 'Réti pools stake existing ALGO to earn Algorand node rewards. Separate token eligibility is unverified.',
    source: 'txnlab.gitbook.io/reti-open-pooling',
  },
}

export const routeEvidence: Record<string, {
  chain: string; title: string; entry: string; exit: string; source: string; transactions?: number;
  inspectMorphoV2?: boolean;
}> = {
  'sentora-curator': {
    inspectMorphoV2: true,
    chain: 'Ethereum', title: 'Sentora-curated Morpho vault',
    entry: 'Open the official Morpho curator view. Select a Sentora vault on Ethereum for an asset you already hold and inspect the underlying markets and liquid balance.',
    exit: 'Preview redeeming the same vault shares. Document available liquidity, the expected underlying received and the fee before committing.',
    source: 'app.morpho.org/curator/sentora',
  },
  'steakhouse-financial': {
    inspectMorphoV2: true,
    chain: 'Base', title: 'Steakhouse Prime Instant USDC',
    entry: 'Find Steakhouse Prime Instant USDC Base in the Prime Instant product documentation. Check the vault share preview, underlying allocations and available liquidity.',
    exit: 'Preview an instant USDC redemption. Check the liquidity buffer and compute the difference between the initial deposit and the expected redemption.',
    source: 'steakhouse.financial/docs/products/vault-products/current/prime-instant',
  },
  gauntlet: {
    inspectMorphoV2: true,
    chain: 'Base', title: 'Gauntlet USDC Prime on Morpho',
    entry: 'Open Gauntlet USDC Prime on Base in the Morpho vault directory. Check the underlying collateral markets and compare their available liquidity.',
    exit: 'Preview USDC withdrawal, verify that the exit is within the liquid balance and record the realized round-trip cost.',
    source: 'app.morpho.org/curator/gauntlet',
  },
  veda: {
    chain: 'Ethereum', title: 'Veda vault with queued exit', transactions: 4,
    entry: 'Locate a live Ethereum BoringVault and verify its Teller and accepted deposit asset. Check the share exchange rate and whether instant withdrawals are enabled.',
    exit: 'When the instant buffer is unavailable, inspect the BoringQueue maturity and solver settlement conditions. Allow for a separate withdrawal request.',
    source: 'docs.veda.tech/architecture-and-flow-of-funds/core-components',
  },
  upshift: {
    chain: 'Ethereum', title: 'Upshift vault with epoch settlement', transactions: 4,
    entry: 'Choose an Ethereum vault that accepts an asset you already hold. Read its previewDeposit and previewRedeem quotes before approving.',
    exit: 'Check whether the vault supports an instant exit. Otherwise verify the next redemption epoch, submit the request and allow for a claim after maturity.',
    source: 'docs.upshift.finance/contracts/vault-interface',
  },
  lagoon: {
    chain: 'Base', title: 'Lagoon asynchronous vault', transactions: 5,
    entry: 'Review a Base vault’s requestDeposit flow, including the approval, request and share claim. Check the curator and the published valuation schedule.',
    exit: 'Confirm the cadence of redemption settlement and when the approved request can be claimed. Quoted shares and the settled asset amount can differ.',
    source: 'docs.lagoon.finance/vault/deposit-and-withdraw-flows',
  },
  tydro: {
    chain: 'Ink', title: 'Tydro supply and withdrawal',
    entry: 'Open a Tydro supply market on Ink for an asset you already hold. Check supply caps, current utilization and the available underlying liquidity.',
    exit: 'Preview the withdrawal of the supplied asset. If liquidity is too low for an immediate exit, account for the waiting cost and avoid increasing the position.',
    source: 'docs.tydro.com',
  },
}

export const morphoV2Evidence: ImplementationEvidence = {
  source: 'github.com/morpho-org/vault-v2#erc4626',
  finding: 'If the selected vault is Morpho V2, the maxWithdraw and maxRedeem calls return zero by design. Check idle assets plus withdrawable liquidity from the configured adapter. The share redemption preview gives the asset amount, while available liquidity determines whether an immediate exit can settle.',
}
