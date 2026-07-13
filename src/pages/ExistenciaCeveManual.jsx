import CsvUploadBatchPage from '../components/CsvUploadBatchPage'

export default function ExistenciaCeveManual() {
  return (
    <CsvUploadBatchPage
      apiPath="/api/existencia-ceve-manual"
      title="Existencia CeVe Manual"
      description="Existencia física manual por CeVe, Item y fecha de venta."
      csvCols={['fecha_venta', 'cod_ceve', 'item', 'cantidad']}
      templateFileName="template_existencia_ceve_manual.csv"
      templateSampleRow="2026-07-18,20009,0835,120"
    />
  )
}
