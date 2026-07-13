import CsvUploadBatchPage from '../components/CsvUploadBatchPage'

export default function PedidoVsCargoReal() {
  return (
    <CsvUploadBatchPage
      apiPath="/api/pedido-vs-cargo-real"
      title="PedidoVSCargo Real"
      description="Pedido y cargo real en piezas por CeVe, Item y fecha de venta."
      csvCols={['fecha_venta', 'cod_ceve', 'item', 'cargo_pzs', 'pedido_pzs']}
      templateFileName="template_pedido_vs_cargo_real.csv"
      templateSampleRow="2026-07-18,20009,0835,120,115"
    />
  )
}
