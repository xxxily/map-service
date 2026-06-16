import fs from 'fs-extra'
import { MeiliSearch } from 'meilisearch'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function handler () {
  const data = await fs.readJson(path.resolve(__dirname, './salice.json'))

  const Sheet1 = data.Sheet2
  // console.log(Sheet1)

  const client = new MeiliSearch({
    host: 'http://192.168.0.120:17700',
    apiKey: 'HmPEKZhcoANzRt3DTPhRQVRxPEVZw7m2TymKwKhs_GYx2FS',
  })

  const res = await client.index('salice').addDocuments(Sheet1)
  console.log(res)

  const index = client.index('salice')

  /* https://www.meilisearch.com/docs/reference/api/search */
  const searchResult = await index.search('铰臂 钛金', {
    /* 最多显示多少条结果 */
    limit: 3,
    /* 显示排行分数 */
    showRankingScore: true,
    /* 排除分数较低的结果 */
    rankingScoreThreshold: 0.5,
  })

  console.log(searchResult)
}

handler()
