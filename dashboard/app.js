const board = window.RADAR_DATA
const element = id => document.getElementById(id)
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const shortMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const compact = number => number == null ? '—' : shortMoney.format(number)
const miss = number => number == null ? '—' : number.toFixed(2) + '×'
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const valuationRange = row => row.low_usd == null ? '—' : compact(row.low_usd) + ' – ' + compact(row.high_usd)
const scenario100 = row => row.farm.scenarios.find(scenario => scenario.capital === 100)
const actionCost = row => scenario100(row)?.total ?? row.farm.review.cost
const stat = (title, value) => '<div><dt>' + title + '</dt><dd>' + value + '</dd></div>'

if (board) initialize()
else element('missing').hidden = false

function initialize() {
  const rows = board.rows
  const validation = board.validation
  element('radar').hidden = false
  element('source').textContent = 'Make.fun snapshot / ' + board.as_of.slice(0, 10)
  element('asof').textContent = board.as_of.slice(0, 10)
  element('summary').innerHTML = [
    ['Protocols ranked', rows.length, 'Complete research universe'],
    ['Official watchlist', rows.filter(row => row.watchlist).length + '<em> / ' + board.watchlist_size + '</em>', 'Every required protocol covered'],
    ['Traded peer families', validation.traded_families, 'One observation per token family'],
    ['Dated holdout error', miss(validation.median_miss.final), validation.held_out + ' held-out observations'],
  ].map(([label, value, note]) => '<div><dt>' + label + '</dt><dd>' + value + '</dd><small>' + note + '</small></div>').join('')
  element('model-brief').innerHTML = '<span>' + miss(validation.median_miss.final) + '<small>PUBLISHED BLEND</small></span><span>' +
    miss(validation.challenger.dated_median_miss) + '<small>THEIL–SEN CHECK</small></span>'
  renderValidation(validation)
  for (const [id, values] of [['category', rows.map(row => row.category)], ['chain', rows.flatMap(row => row.chains)]]) {
    for (const value of [...new Set(values)].sort()) element(id).add(new Option(value, value))
  }

  const pageSize = 6
  let page = 0
  let sorting = { key: 'rank', direction: 1 }
  function render() {
    const query = element('search').value.trim().toLowerCase()
    const category = element('category').value
    const chain = element('chain').value
    const coverage = element('coverage').value
    const filtered = rows.filter(row =>
      (!query || [row.name, row.slug, ...row.chains].join(' ').toLowerCase().includes(query)) &&
      (!category || row.category === category) && (!chain || row.chains.includes(chain)) &&
      (!element('watch').checked || row.watchlist) &&
      (coverage !== 'leads' || !row.related_asset) &&
      (coverage !== 'related' || row.related_asset) &&
      (coverage !== 'documented' || (row.farm.route_source && !row.related_asset)))
    filtered.sort((a, b) => {
      const key = sorting.key
      // Desk reviews have no modeled transaction cost; keep them after modeled routes.
      if (key === 'cost' && (!scenario100(a) || !scenario100(b))) {
        const missing = Number(!scenario100(a)) - Number(!scenario100(b))
        if (missing) return missing
      }
      const delta = key === 'name' ? a.name.localeCompare(b.name, 'en') :
        key === 'cost' ? actionCost(a) - actionCost(b) : a[key] - b[key]
      return delta * sorting.direction || a.rank - b.rank
    })
    page = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
    const first = page * pageSize
    element('rows').innerHTML = filtered.slice(first, first + pageSize).map(row => {
      const label = row.related_asset ? 'EXISTING ASSET' : row.watchlist ? 'OFFICIAL 40' : ''
      const mode = row.related_asset ? 'Existing asset review' : scenario100(row) ? '$100 capital scenario' : 'Time for desk review'
      return '<tr><td class="rank">' + String(row.rank).padStart(2, '0') + '<small>P10–90 ' + row.rank_band.p10 + '–' + row.rank_band.p90 +
        '</small></td><th scope="row"><button class="protocol-name" data-rank="' + row.rank + '">' + escape(row.name) +
        '</button>' + (label ? '<span class="tag ' + (row.related_asset ? 'warning' : '') + '">' + label + '</span>' : '') +
        '<small>' + escape(row.category + ' · ' + row.chains.join(', ')) + '</small></th><td>' + compact(row.tvl_usd) +
        '</td><td class="value">' + compact(row.implied_value_usd) + '</td><td class="range">' + valuationRange(row) +
        '</td><td>' + money.format(actionCost(row)) + '<small>' + mode + '</small></td><td class="arrow">↗</td></tr>'
    }).join('') || '<tr><td colspan="7">No protocols match these filters. Reset to explore the complete universe.</td></tr>'
    element('count').textContent = filtered.length ? (first + 1) + '–' + Math.min(first + pageSize, filtered.length) + ' of ' + filtered.length + ' protocols' : '0 protocols'
    element('prev').disabled = page === 0
    element('next').disabled = first + pageSize >= filtered.length
  }
  element('filters').addEventListener('submit', event => event.preventDefault())
  element('filters').addEventListener('input', () => { page = 0; render() })
  element('filters').addEventListener('reset', () => setTimeout(() => { page = 0; render() }))
  element('prev').addEventListener('click', () => { page = Math.max(0, page - 1); render() })
  element('next').addEventListener('click', () => { page++; render() })
  for (const button of document.querySelectorAll('button[data-sort]')) {
    button.addEventListener('click', () => {
      const key = button.dataset.sort
      sorting = { key, direction: key === sorting.key ? -sorting.direction : ['rank', 'name', 'cost'].includes(key) ? 1 : -1 }
      for (const header of document.querySelectorAll('th[aria-sort]')) header.removeAttribute('aria-sort')
      button.parentElement.setAttribute('aria-sort', sorting.direction === 1 ? 'ascending' : 'descending')
      page = 0
      render()
    })
  }
  element('rows').addEventListener('click', event => {
    const selected = event.target.closest('button[data-rank]')
    if (selected) {
      const row = rows.find(row => row.rank === Number(selected.dataset.rank))
      if (row) showProtocol(row)
    }
  })
  element('close').addEventListener('click', () => element('protocol').close())
  element('model-link').addEventListener('click', () => { element('model').open = true })
  const hash = new URLSearchParams(location.hash.slice(1))
  if (hash.has('watchlist')) {
    element('watch').checked = true
    element('coverage').value = 'all'
    if ([...element('category').options].some(option => option.value === hash.get('watchlist'))) element('category').value = hash.get('watchlist')
  }
  if (hash.get('coverage') === 'related') element('coverage').value = 'related'
  if (hash.has('model')) element('model').open = true
  render()
  const selected = rows.find(row => row.slug === hash.get('protocol'))
  if (selected) showProtocol(selected)
}

function renderValidation(v) {
  const scale = Math.max(1, ...v.folds.flatMap(fold => [fold.published, fold.theil_sen]))
  const bar = number => '<td class="error" style="--bar:' + (100 * number / scale).toFixed(1) + '%">' + miss(number) + '</td>'
  element('validation').innerHTML = '<h3>Same peers. Two estimators.</h3><p>A robust log-TVL curve is blended with regularized growth, tracking-age and category signals. ' +
    'The signal weight is ' + (v.blend * 100).toFixed(1) + '%, selected from completed folds only. One observation per traded token family prevents duplicated tokens from dominating.</p>' +
    '<dl class="stats">' + stat('Median ratio baseline', miss(v.median_miss.ratio)) + stat('TVL curve', miss(v.median_miss.curve)) +
    stat('Full signal model', miss(v.median_miss.full)) + stat('Published blend', miss(v.median_miss.final)) + '</dl>' +
    '<p>Theil–Sen was closer for ' + v.challenger.dated_wins + '/' + v.held_out + ' matched holdouts. Lower multiplicative error is better.</p>' +
    '<div class="table-scroll"><table class="comparison"><thead><tr><th>Held-out tracking dates</th><th>Train / test</th><th>Published blend</th><th>Theil–Sen</th></tr></thead><tbody>' +
    v.folds.map(fold => '<tr><th>' + escape(fold.from + ' → ' + fold.to) + '</th><td>' + fold.train + ' / ' + fold.test + '</td>' + bar(fold.published) + bar(fold.theil_sen) + '</tr>').join('') + '</tbody></table></div>' +
    '<p>Across ' + v.leave_one_family_out.count + ' leave-one-family-out fits: fixed 25% signal blend ' + miss(v.leave_one_family_out.median_miss) +
    '; Theil–Sen ' + miss(v.challenger.family_median_miss) + '. The challenger improves the dated test and worsens the family test, so the approved blend remains published.</p>' +
    '<p>' + escape(v.design) + ' These are snapshot generalization tests; historical launch-day forecasts need point-in-time observations.</p>' +
    '<p>Value ranges are P10–P90 held-out residuals, not confidence guarantees. Rank bands are P10–P90 across ' + v.rank_refits + ' deterministic peer resamples. ' +
    board.recorded_token_count + ' token-recorded protocols are set aside; ' + board.no_token_excluded + ' other rows are screened by category or name. ' +
    board.rows.filter(row => row.related_asset).length + ' related-asset records remain for complete coverage and are filtered from the default launch research view.</p>' +
    '<p class="source-note">Research lineage: approved review engine; SciPy joint-intercept Theil–Sen definition; original upstream research described in PROVENANCE.md. ' +
    'The input omits parent-protocol relationships; additional discovery uses category and name heuristics.</p>'
}

function showProtocol(row) {
  const plan = row.farm
  const factors = 'TVL base ' + compact(row.size_value_usd) + ' × ' + row.category_multiplier.toFixed(3) + ' category (' + row.category_peers + ' peers)' +
    ' × ' + row.momentum_multiplier.toFixed(3) + ' growth × ' + row.age_multiplier.toFixed(3) + ' tracking age'
  const evidence = plan.implementation ? '<div class="evidence"><strong>IMPLEMENTATION EVIDENCE</strong><p>' + escape(plan.implementation.finding) +
    '</p><p class="source-note">' + escape(plan.implementation.source) + '</p></div>' : ''
  const costs = plan.scenarios.length ? '<div class="table-scroll"><table class="cost"><thead><tr><th>Capital</th><th>Gas</th><th>Friction</th><th>Total</th><th>10% odds</th><th>25% odds</th><th>50% odds</th></tr></thead><tbody>' +
    plan.scenarios.map(scenario => '<tr>' + [scenario.capital, scenario.network, scenario.friction, scenario.total, scenario.award_at_10pct, scenario.award_at_25pct, scenario.award_at_50pct]
      .map(number => '<td>' + money.format(number) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
    '<p class="source-note">The last three columns are break-even awards, total cost ÷ assumed award probability. Cost includes gas, friction, $2.50 time and 5% annual capital carry for ' + plan.hold_days + ' days. These are scenarios, not fee quotes.</p>' +
    '<div class="calculator"><h3>Price your own assumptions</h3><form id="scenario"><label>Capital ($)<select name="capital">' + plan.scenarios.map(scenario => '<option' + (scenario.capital === 100 ? ' selected' : '') + '>' + scenario.capital + '</option>').join('') +
    '</select></label><label>Award chance (%)<input name="odds" type="number" min="0" max="100" step="any" value="25" required></label><label>Award received ($)<input name="reward" type="number" min="0" step="any" value="100" required></label></form><p id="net" aria-live="polite">Choose a probability and award to estimate net value.</p></div>' :
    '<p class="notice">Desk review: ' + plan.review.minutes + ' minutes / ' + money.format(plan.review.cost) + ' time cost. Capital $0; network $0. ' +
    (plan.missing_gas_quote ? 'A chain fee quote is missing.' : 'Document eligible activity and an exit before proceeding.') + '</p>'
  element('detail').innerHTML = '<div class="detail-header"><p class="eyebrow">RANK ' + row.rank + ' · ' + escape(row.category) + '</p><h2 id="protocol-title">' +
    escape(row.name) + '</h2><p>' + escape(row.chains.join(' · ')) + (row.watchlist ? ' · Official watchlist' : '') + '</p><dl class="stats">' +
    stat('Conditional implied cap', compact(row.implied_value_usd)) + stat('Holdout value range', valuationRange(row)) + stat('Observed TVL', compact(row.tvl_usd)) +
    stat('Rank sensitivity P10–P90', row.rank_band.p10 + '–' + row.rank_band.p90) + '</dl></div><div class="detail-body"><section><p class="eyebrow">VALUATION & COST</p><p class="factors">' + factors + '</p>' +
    '<p>7-day TVL growth: ' + (row.change_7d == null ? 'unreported' : row.change_7d.toFixed(2) + '%') + ' · Tracked since ' + escape(row.listed_at ?? 'unreported') + '.</p>' +
    '<details><summary>Inspect three traded comparables</summary><ul>' + row.nearest.map(peer => '<li>' + escape(peer.name) + ' · ' + escape(peer.category ?? 'Unclassified') + ' · TVL ' + compact(peer.tvl_usd) + ' · market cap ' + compact(peer.mcap_usd) + '</li>').join('') + '</ul></details>' +
    (row.related_asset ? '<p class="notice">' + escape(row.related_asset.note) + ' Retained for complete coverage.</p><p class="source-note">' + escape(row.related_asset.source) + '</p>' : '') +
    '<h3>' + escape(plan.type) + '</h3>' + costs + '</section><section><p class="eyebrow">EXECUTION RESEARCH / ' + escape(plan.chain) + '</p>' +
    '<p class="notice">Campaign eligibility, a future launch and any award remain unverified.</p>' + evidence +
    (plan.route_source ? '<p class="source-note">Product / route source: ' + escape(plan.route_source) + '</p>' : '') +
    '<ol class="steps">' + row.farm_steps.map(step => '<li>' + escape(step) + '</li>').join('') + '</ol></section></div>'
  if (plan.scenarios.length) attachCalculator(plan)
  element('protocol').showModal()
  element('protocol').scrollTop = 0
}

function attachCalculator(plan) {
  const form = element('scenario')
  const recalculate = () => {
    const { capital, odds, reward } = form.elements
    const probability = Number(odds.value)
    const award = Number(reward.value)
    const scenario = plan.scenarios.find(scenario => scenario.capital === Number(capital.value))
    if (!scenario || odds.value === '' || reward.value === '' || !Number.isFinite(probability) ||
        !Number.isFinite(award) || probability < 0 || probability > 100 || award < 0 || !form.checkValidity()) {
      element('net').textContent = 'Enter a chance from 0 to 100 and a nonnegative award.'
      return
    }
    const net = probability / 100 * award - scenario.total
    element('net').textContent = money.format(net) + ' expected net · ' + money.format(scenario.total) +
      ' estimated cost. ' + (probability ? 'Break-even award: ' + money.format(scenario.total / (probability / 100)) + '.' : 'No award is assumed at 0%.')
  }
  form.addEventListener('input', recalculate)
  form.addEventListener('submit', event => { event.preventDefault(); recalculate() })
  // The real DOM has its controls after innerHTML; minimal offline test adapters do not.
  if (form.elements.capital && form.elements.odds && form.elements.reward) recalculate()
}
