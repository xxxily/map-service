import fs from 'fs-extra'
import MiniSearch from 'minisearch'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function handler () {
  const data = await fs.readJson(path.resolve(__dirname, './salice.json'))

  const Sheet1 = data.Sheet2
  // console.log(Sheet1)

  const miniSearch = new MiniSearch({
    // fields: ['产品名称'],
    fields: ['产品编码', '产品名称', '产品型号', '产品规格'], // fields to index for full-text search
    storeFields: ['id', '产品编码', '产品名称', '产品型号', '产品规格', '品牌', '产品图', '产品描述', '单位', '单价(不打折含税)', '库存情况', '备注'], // fields to return with search results
    searchOptions: {
      combineWith: 'AND', // use AND operator for terms by default
      boost: { 产品名称: 100, },
      fuzzy: true,
    },
  })

  // Index all documents
  miniSearch.addAll(Sheet1)

  const results = miniSearch.search('厚门板 铰链 无盖', {
    // fields: ['产品名称'],
    // fuzzy: true,
  })
  // const results = miniSearch.autoSuggest('厚门板')

  console.log(results[0], results[1])
}

handler()
