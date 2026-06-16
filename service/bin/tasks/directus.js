import { createDirectus, rest, staticToken, createItem, readItems, deleteItems } from '@directus/sdk'

const client = createDirectus('http://192.168.0.120:8055')
  .with(staticToken('1kFDwVUsPZVKh1rttYBvAaksYVZ-Ho2x'))
  .with(rest())

let count = 0
async function init () {
  const result = await client.request(
    readItems('chats', {})
  )

  if (!result.length) {
    console.error('No data found')
  }

  const ids = result.map(item => item.id)

  const res = await client.request(
    deleteItems('chats', ids)
  )

  count++

  console.log(result.length, ids, count++, res.ok)
}

/* 循环删除chats表中的所有数据 */
for (let i = 0; i < 10000; i++) {
  await init()
}
