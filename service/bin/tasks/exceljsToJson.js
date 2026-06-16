import ExcelJS from 'exceljs'
import fs from 'fs'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const parseExcelToJSON = async (filePath) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const jsonData = {}

  workbook.eachSheet((worksheet, sheetId) => {
    const headers = worksheet.getRow(1).values
    const sheetData = []

    worksheet.eachRow({ includeEmpty: true, }, (row, rowNumber) => {
      if (rowNumber !== 1) {
        const rowData = {}
        row.eachCell({ includeEmpty: true, }, (cell, colNumber) => {
          const value = cell.value
          const header = headers[colNumber]
          rowData[header] = value
        })
        sheetData.push(rowData)
      }
    })

    jsonData[`Sheet${sheetId}`] = sheetData
  })

  return jsonData
}

const filePath = path.resolve(__dirname, './salice.xlsx')

parseExcelToJSON(filePath)
  .then((jsonData) => {
    console.log(jsonData)

    /* 取filePath的文件名，作为output的文件名 */
    const outputFileName = filePath.split('/').pop().split('.')[0]
    // console.log(outputFileName)

    // 将 JSON 数据写入文件
    fs.writeFileSync(path.resolve(__dirname, `./${outputFileName}.json`), JSON.stringify(jsonData, null, 2))
  })
  .catch((err) => console.error('Error parsing Excel: ', err))

export default parseExcelToJSON
