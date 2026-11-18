// Runs only in a temporary instrumented copy of the generated preview.
document.addEventListener('DOMContentLoaded', () => {
  const result = document.createElement('pre')
  result.id = 'smoke-result'
  const checked = []
  const assert = (condition, message) => { if (!condition) throw Error(message); checked.push(message) }
  const get = id => document.getElementById(id)
  const filter = (id, value) => { get(id).value = value; get('filters').dispatchEvent(new Event('input', { bubbles: true })) }
  const count = () => get('count').textContent
  const firstRank = () => Number(get('rows').querySelector('button[data-rank]')?.dataset.rank)
  const reset = () => {
    get('search').value = ''
    get('category').value = ''
    get('chain').value = ''
    get('watch').checked = false
    filter('coverage', 'leads')
  }
  try {
    assert(!get('radar').hidden && count().includes('of 185 protocols'), 'real browser renders 185 default leads')
    get('next').click()
    assert(count().startsWith('7–12'), 'next page changes visible rows')
    get('prev').click()
    assert(firstRank() === 1 && get('prev').disabled, 'previous page returns to first rank')
    filter('search', 'no-such-protocol-987654321')
    assert(count() === '0 protocols' && get('next').disabled, 'empty search disables paging')
    reset()
    filter('coverage', 'related')
    assert(count().includes('of 7 protocols'), 'related-asset filter exposes seven records')
    filter('coverage', 'all')
    get('watch').checked = true
    get('filters').dispatchEvent(new Event('input'))
    assert(count().includes('of 40 protocols'), 'official watchlist filter preserves all forty')
    reset()
    filter('chain', 'Ethereum')
    const expectedEthereum = window.RADAR_DATA.rows.filter(row => !row.related_asset && row.chains.includes('Ethereum')).length
    assert(count().includes('of ' + expectedEthereum + ' protocols'), 'chain filter matches snapshot membership')
    reset()
    const sortButton = document.querySelector('[data-sort="name"]')
    sortButton.click()
    const alphabetic = window.RADAR_DATA.rows.filter(row => !row.related_asset).sort((a, b) => a.name.localeCompare(b.name, 'en'))
    assert(firstRank() === alphabetic[0].rank, 'name sort ascends')
    sortButton.click()
    assert(firstRank() === alphabetic.at(-1).rank, 'name sort reverses')
    document.querySelector('[data-sort="rank"]').click()
    let evidence = 0
    for (const row of window.RADAR_DATA.rows) {
      // Delegated clicks can inspect every retained record without changing its rank.
      const trigger = document.createElement('button')
      trigger.dataset.rank = String(row.rank)
      get('rows').append(trigger)
      trigger.click()
      if (!get('protocol').open || !get('detail').textContent.includes('RANK ' + row.rank + ' ·')) throw Error('Missing detail: ' + row.slug)
      if (row.farm.implementation) {
        if (!get('detail').textContent.includes(row.farm.implementation.source)) throw Error('Missing implementation source: ' + row.slug)
        evidence++
      }
      get('close').click()
      trigger.remove()
    }
    assert(evidence === 4 && !get('protocol').open, '192 native details open and close, with four implementation sources')
    get('rows').querySelector('[data-rank="1"]').click()
    const form = get('scenario')
    form.elements.capital.value = '100'
    form.elements.odds.value = '25'
    form.elements.reward.value = '100'
    form.dispatchEvent(new Event('input'))
    assert(get('net').textContent.includes('$6.96'), 'calculator computes expected net from scenario cost')
    form.elements.odds.value = '0'
    form.dispatchEvent(new Event('input'))
    assert(get('net').textContent.includes('-$18.04') && get('net').textContent.includes('0%'), 'zero award probability remains finite')
    form.elements.odds.value = '101'
    form.dispatchEvent(new Event('input'))
    assert(get('net').textContent.includes('0 to 100'), 'invalid probability is rejected')
    get('close').click()
    get('model-link').click()
    assert(get('model').open && get('validation').textContent.includes('25/38'), 'model navigation expands matched validation')
    result.textContent = JSON.stringify({ ok: true, checks: checked, userAgent: navigator.userAgent })
  } catch (error) {
    result.textContent = JSON.stringify({ ok: false, error: error.message, checks: checked })
  }
  document.body.append(result)
})
