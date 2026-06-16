import ExcelJS from 'exceljs'
import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const parseExcelToJSON = async (filePath) => {
  // 创建一个新的工作簿
  const workbook = new ExcelJS.Workbook()

  // 读取包含图片的 Excel 文件
  workbook.xlsx.readFile(filePath)
    .then(function () {
      workbook.eachSheet(function (worksheet, sheetId) {
        const sheetName = worksheet.name

        // 遍历工作表中的图片
        worksheet.eachRow({ includeEmpty: true, }, function (row, rowNumber) {
          row.eachCell({ includeEmpty: true, }, function (cell, colNumber) {
            if (cell.type === ExcelJS.ValueType.Hyperlink && cell.hyperlink) {
              // 检查是否为图片链接
              if (cell.hyperlink.targetMode === 'External') {
                // 如果是外部链接，则保存图片
                const link = cell.hyperlink.address
                const imageName = `image_${sheetName}_row${rowNumber}_col${colNumber}.png`

                // 将图片数据写入文件
                if (link.endsWith('.png')) {
                  const imageBuffer = Buffer.from(link.replace(/^data:image\/\w+;base64,/, ''), 'base64')
                  // fs.writeFileSync(imageName, imageBuffer)
                  fs.writeFileSync(path.resolve(__dirname, `./${imageName}`), imageBuffer)
                  console.log(`${imageName} saved successfully.`)
                }
              }
            }
          })
        })
      })
    })
    .catch(function (error) {
      console.error('Error:', error)
    })
}

const filePath = path.resolve(__dirname, './salice.xlsx')

parseExcelToJSON(filePath)
  .then((jsonData) => {
    // console.log(jsonData)

    /* 取filePath的文件名，作为output的文件名 */
    // const outputFileName = filePath.split('/').pop().split('.')[0]
    // console.log(outputFileName)

    // 将 JSON 数据写入文件
    // fs.writeFileSync(path.resolve(__dirname, `./${outputFileName}.json`), JSON.stringify(jsonData, null, 2))
  })
  .catch((err) => console.error('Error parsing Excel: ', err))

export default parseExcelToJSON
