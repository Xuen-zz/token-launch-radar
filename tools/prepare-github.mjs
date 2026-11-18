import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const [owner, repository] = process.argv.slice(2)
if (!owner || !repository || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) || !/^[\w.-]{1,100}$/.test(repository)) {
  throw Error('Usage: node tools/prepare-github.mjs <GitHub owner> <new repository name>')
}
const readme = fileURLToPath(new URL('../README.md', import.meta.url))
const heading = '# Token Launch Radar'
const marker = '<!-- repository-badges -->'
const end = '<!-- /repository-badges -->'
const badges = marker + '\n[![Rank](https://make.fun/badge/token-radar-01/' + owner + '/' + repository +
  '/rank.svg)](https://make.fun/bounty/token-radar-01)\n[![Reward](https://make.fun/badge/token-radar-01/' + owner + '/' + repository +
  '/reward.svg)](https://make.fun/bounty/token-radar-01)\n' + end
let text = readFileSync(readme, 'utf8')
text = text.includes(marker) ? text.replace(/<!-- repository-badges -->[\s\S]*?<!-- \/repository-badges -->/, badges) : text.replace(heading, heading + '\n\n' + badges)
writeFileSync(readme, text)
console.log('Prepared README for https://github.com/' + owner + '/' + repository)
console.log('Create a new public repository. Set About website to https://make.fun/bounty/token-radar-01 and topic to makefun.')
