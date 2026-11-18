export type Protocol = {
  slug: string
  name: string
  category: string | null
  chains: string[]
  tvl_usd: number
  change_7d: number | null
  mcap_usd: number | null
  listed_at: string | null
  gecko_id: string | null
  symbol: string | null
}

export type Snapshot = {
  as_of: string
  floor_usd: number
  protocols: Protocol[]
  watchlist: string[]
}

type Comparable = Protocol & { x: number; y: number; key: string }
type Curve = { x0: number; intercept: number; slope: number }
type Model = {
  curve: Curve
  peers: Map<string, { adjustment: number; count: number }>
  baseline: number
  momentum: number
  age: number
  asOf: number
}

const category = (p: Protocol) => p.category?.trim().toLowerCase() || 'unclassified'
const derived = /\b(wrapped|staked|staking|bridged)\b|\s(?:v\d+(?:\.\d+)*|\d+\.\d+)$/i
const exchange = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i
const excluded = /^(bridge|canonical bridge|liquid staking|liquid restaking|restaking|restaked btc|stablecoin wrapper|anchor btc|decentralized btc|cex)$/i
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const primary = (p: Protocol) => !excluded.test(category(p)) && !derived.test(p.name) && !exchange.test(p.name)
const noToken = (p: Protocol) => !p.gecko_id && !p.symbol && p.mcap_usd == null
const validDate = (d: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d))

function quantile(values: number[], p: number): number {
  const ordered = [...values].sort((a, b) => a - b)
  if (!ordered.length) throw new Error('Quantile requires observations.')
  const position = p * (ordered.length - 1)
  const lower = Math.floor(position)
  return ordered[lower] + (ordered[Math.ceil(position)] - ordered[lower]) * (position - lower)
}

function comparables(protocols: Protocol[]) {
  const families = new Map<string, Comparable>()
  const idsByTicker = new Map<string, Set<string>>()
  const eligible = protocols.filter(p => primary(p) && (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0)
  for (const p of eligible) {
    if (!p.symbol || !p.gecko_id) continue
    const ticker = p.symbol.toUpperCase()
    const ids = idsByTicker.get(ticker) ?? new Set<string>()
    ids.add(p.gecko_id)
    idsByTicker.set(ticker, ids)
  }
  for (const p of eligible) {
    const ticker = p.symbol?.toUpperCase() ?? ''
    const ids = idsByTicker.get(ticker)
    if (!p.gecko_id && ids && ids.size > 1) continue
    const id = p.gecko_id ?? (ids?.size === 1 ? [...ids][0] : null)
    const key = id ? 'id:' + id : ticker ? 'ticker:' + ticker : ''
    if (!key) continue
    const existing = families.get(key)
    if (!existing || p.tvl_usd > existing.tvl_usd ||
        (p.tvl_usd === existing.tvl_usd && lexical(p.slug, existing.slug) < 0)) {
      families.set(key, { ...p, key, x: Math.log(p.tvl_usd), y: Math.log(p.mcap_usd!) })
    }
  }
  return [...families.values()].sort((a, b) => lexical(a.key, b.key))
}

function features(p: Protocol, asOf: number) {
  const ageDays = validDate(p.listed_at) ? (asOf - Date.parse(p.listed_at)) / 86_400_000 : -1
  return [
    Number.isFinite(p.change_7d) ? Math.max(-1, Math.min(1, p.change_7d! / 35)) : 0,
    ageDays >= 0 ? Math.log1p(Math.min(ageDays, 3650) / 365) - Math.log(2) : 0,
  ]
}

function fit(samples: Comparable[], asOf: number, extraFeatures = false): Model {
  const x0 = quantile(samples.map(p => p.x), .5)
  let intercept = quantile(samples.map(p => p.y), .5)
  let slope = .65
  const coefficients = [0, 0]
  const signals = samples.map(p => features(p, asOf))
  const adjustment = (i: number) => coefficients[0] * signals[i][0] + coefficients[1] * signals[i][1]
  for (let iteration = 0; iteration < 24; iteration++) {
    const errors = samples.map((p, i) => p.y - intercept - slope * (p.x - x0) - adjustment(i))
    const center = quantile(errors, .5)
    const threshold = 1.5 * Math.max(.25, 1.4826 * quantile(errors.map(e => Math.abs(e - center)), .5))
    const weights = errors.map(error => Math.min(1, threshold / Math.max(Number.EPSILON, Math.abs(error))))
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i].x - x0
      const y = samples[i].y - adjustment(i)
      const w = weights[i]
      sw += w
      sx += w * x
      sy += w * y
      sxx += w * x * x
      sxy += w * x * y
    }
    const ridge = 2
    slope = Math.max(0, Math.min(1.5, (sxy - sx * sy / sw + ridge * .65) / (sxx - sx * sx / sw + ridge)))
    intercept = (sy - slope * sx) / sw
    if (extraFeatures) {
      for (let k = 0; k < coefficients.length; k++) {
        let numerator = 0, denominator = 14
        for (let i = 0; i < samples.length; i++) {
          const p = samples[i]
          const x = signals[i][k]
          const y = p.y - intercept - slope * (p.x - x0) - coefficients[1 - k] * signals[i][1 - k]
          numerator += weights[i] * x * y
          denominator += weights[i] * x * x
        }
        coefficients[k] = Math.max(-.6, Math.min(.6, numerator / denominator))
      }
    }
  }
  const groups = new Map<string, number[]>()
  for (const [i, p] of samples.entries()) {
    const name = category(p)
    const group = groups.get(name) ?? []
    group.push(p.y - intercept - slope * (p.x - x0) - adjustment(i))
    groups.set(name, group)
  }
  const peers = new Map([...groups].map(([name, errors]) => [
    name, { adjustment: quantile(errors, .5) * errors.length / (errors.length + 8), count: errors.length }
  ]))
  return {
    curve: { x0, intercept, slope }, peers, baseline: quantile(samples.map(p => p.y - p.x), .5),
    momentum: coefficients[0], age: coefficients[1], asOf,
  }
}

function predict(model: Model, p: Protocol, usePeers: boolean) {
  const { x0, intercept, slope } = model.curve
  const [momentum, age] = features(p, model.asOf)
  return intercept + slope * (Math.log(p.tvl_usd) - x0) + model.momentum * momentum +
    model.age * age + (usePeers ? model.peers.get(category(p))?.adjustment ?? 0 : 0)
}

function fitTheilSen(samples: Comparable[]): Curve {
  const slopes: number[] = []
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i]
    for (let j = 0; j < i; j++) {
      const a = samples[j]
      if (a.x !== b.x) slopes.push((b.y - a.y) / (b.x - a.x))
    }
  }
  const slope = slopes.length ? quantile(slopes, .5) : 0
  const x0 = quantile(samples.map(p => p.x), .5)
  const intercept = quantile(samples.map(p => p.y - slope * (p.x - x0)), .5)
  return { x0, intercept, slope }
}

const curveValue = (curve: Curve, logTvl: number) => curve.intercept + curve.slope * (logTvl - curve.x0)
const medianMiss = (values: number[]) => values.length
  ? Math.exp(quantile(values.map(Math.abs), .5)) : null

export function buildEstimator(snapshot: Snapshot) {
  const samples = comparables(snapshot.protocols)
  if (samples.length < 8) throw new Error('At least eight distinct traded comparables are required.')
  const dated = samples.filter(p => validDate(p.listed_at) && p.listed_at <= snapshot.as_of.slice(0, 10))
    .sort((a, b) => lexical(a.listed_at!, b.listed_at!) || lexical(a.key, b.key))
  const folds: { from: string; to: string; train: number; test: number; published: number; theil_sen: number }[] = []
  const errors = { ratio: [] as number[], curve: [] as number[], full: [] as number[], final: [] as number[], theil_sen: [] as number[] }
  const asOf = Date.parse(snapshot.as_of)
  const weight = () => {
    // Fit the blend on completed folds only. A small prior resists a large
    // weight change from a handful of volatile token prices.
    let numerator = 1.25, denominator = 5
    for (const [i, error] of errors.curve.entries()) {
      const difference = error - errors.full[i]
      numerator += error * difference
      denominator += difference * difference
    }
    return Math.max(.1, Math.min(.5, numerator / denominator))
  }
  const warmup = Math.max(8, Math.floor(dated.length * .45))
  const blockSize = Math.max(1, Math.ceil((dated.length - warmup) / 5))
  let start = warmup
  while (start < dated.length && dated[start].listed_at === dated[start - 1].listed_at) start++
  while (start < dated.length) {
    let end = Math.min(dated.length, start + blockSize)
    while (end < dated.length && dated[end].listed_at === dated[end - 1].listed_at) end++
    const train = dated.slice(0, start)
    const model = fit(train, asOf)
    const full = fit(train, asOf, true)
    const challenger = fitTheilSen(train)
    const blend = weight()
    const held = dated.slice(start, end)
    const startError = errors.final.length
    for (const p of held) {
      errors.ratio.push(p.y - (p.x + model.baseline))
      const curveError = p.y - predict(model, p, false)
      const fullError = p.y - predict(full, p, true)
      errors.curve.push(curveError)
      errors.full.push(fullError)
      errors.final.push((1 - blend) * curveError + blend * fullError)
      errors.theil_sen.push(p.y - curveValue(challenger, p.x))
    }
    folds.push({ from: held[0].listed_at!, to: held.at(-1)!.listed_at!, train: start, test: held.length,
      published: medianMiss(errors.final.slice(startError))!, theil_sen: medianMiss(errors.theil_sen.slice(startError))! })
    start = end
  }
  const model = fit(samples, asOf, true)
  const sizeModel = fit(samples, asOf)
  const blend = weight()
  const history = errors.final
  const leaveOneOut = samples.map((held, i) => {
    const train = samples.filter((_, j) => j !== i)
    const size = predict(fit(train, asOf), held, false)
    const signals = predict(fit(train, asOf, true), held, true)
    return { published: held.y - (.75 * size + .25 * signals),
      theil_sen: held.y - curveValue(fitTheilSen(train), held.x) }
  })
  const refits = 80
  const bounds = history.length >= 10
    ? [Math.min(0, quantile(history, .1)), Math.max(0, quantile(history, .9))]
    : null
  const integerValue = (log: number) => Math.max(1, Math.min(100_000_000_000_000, Math.round(Math.exp(log))))
  return {
    validation: {
      traded_families: samples.length, dated_families: dated.length, held_out: history.length, folds,
      median_miss: { ratio: medianMiss(errors.ratio), curve: medianMiss(errors.curve), full: medianMiss(errors.full), final: medianMiss(history) },
      slope: (1 - blend) * sizeModel.curve.slope + blend * model.curve.slope, blend,
      leave_one_family_out: { count: leaveOneOut.length, median_miss: medianMiss(leaveOneOut.map(e => e.published)), signal_weight: .25 },
      challenger: {
        name: 'Theil–Sen TVL curve',
        dated_median_miss: medianMiss(errors.theil_sen),
        family_median_miss: medianMiss(leaveOneOut.map(e => e.theil_sen)),
        dated_wins: errors.theil_sen.filter((error, i) => Math.abs(error) < Math.abs(history[i])).length,
      },
      rank_refits: refits,
      band: bounds ? 'P10–P90 held-out residuals' : null,
      design: 'Rolling holdout by DefiLlama tracking date. TVL and market caps are contemporaneous snapshot observations in every fold.',
    },
    rankBands(protocols: Protocol[]) {
      const ranks = new Map(protocols.map(p => [p.slug, [] as number[]]))
      let seed = 0x42c17f05
      for (let trial = 0; trial < refits; trial++) {
        const sampled = samples.map(() => {
          seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
          return samples[Math.floor(seed * samples.length / 2 ** 32)]
        })
        const size = fit(sampled, asOf)
        const rich = fit(sampled, asOf, true)
        const sorted = protocols.map(p => ({
          slug: p.slug, price: (1 - blend) * predict(size, p, false) + blend * predict(rich, p, true),
        })).sort((a, b) => b.price - a.price || lexical(a.slug, b.slug))
        for (const [i, p] of sorted.entries()) ranks.get(p.slug)!.push(i + 1)
      }
      return new Map([...ranks].map(([slug, result]) => [slug, {
        p10: Math.floor(quantile(result, .1)), p90: Math.ceil(quantile(result, .9)),
      }]))
    },
    price(p: Protocol) {
      const [momentum, age] = features(p, asOf)
      const group = model.peers.get(category(p))
      const categoryEffect = blend * (group?.adjustment ?? 0)
      const momentumEffect = blend * model.momentum * momentum
      const ageEffect = blend * model.age * age
      const size = (1 - blend) * predict(sizeModel, p, false) +
        blend * (predict(model, p, false) - model.momentum * momentum - model.age * age)
      const estimate = size + categoryEffect + momentumEffect + ageEffect
      const nearby = [...samples].sort((a, b) =>
        Number(category(b) === category(p)) - Number(category(a) === category(p)) ||
        Math.abs(a.x - Math.log(p.tvl_usd)) - Math.abs(b.x - Math.log(p.tvl_usd)) ||
        lexical(a.slug, b.slug)).slice(0, 3)
      return {
        implied_value_usd: integerValue(estimate),
        low_usd: bounds ? integerValue(estimate + bounds[0]) : null,
        high_usd: bounds ? integerValue(estimate + bounds[1]) : null,
        size_value_usd: integerValue(size),
        momentum_multiplier: Math.exp(momentumEffect),
        age_multiplier: Math.exp(ageEffect),
        category_peers: group?.count ?? 0,
        category_multiplier: Math.exp(categoryEffect),
        nearest: nearby.map(peer => ({ name: peer.name, category: peer.category, tvl_usd: peer.tvl_usd, mcap_usd: peer.mcap_usd })),
      }
    },
  }
}

export function candidates(snapshot: Snapshot) {
  const watchlist = new Set(snapshot.watchlist)
  const slugs = new Set(snapshot.protocols.map(p => p.slug))
  for (const slug of watchlist) if (!slugs.has(slug)) throw new Error('Missing watchlist protocol: ' + slug)
  return snapshot.protocols.filter(p => watchlist.has(p.slug) || (noToken(p) && primary(p)))
}
