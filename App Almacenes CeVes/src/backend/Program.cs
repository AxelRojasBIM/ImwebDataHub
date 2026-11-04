using System.Diagnostics;
using Microsoft.Data.Sqlite;

// ── Carpeta raíz portable ────────────────────────────────────────────────────
// La app busca una carpeta "Datos" empezando en el directorio del .exe y
// subiendo niveles, hasta 8, para que funcione tanto publicada (Datos/ junto
// al .exe) como en desarrollo (Datos/ en la raíz de "App Almacenes CeVes/").
// La primera vez que corre sin encontrar nada, crea "Datos" junto al .exe.
string FindAppRoot()
{
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    for (int i = 0; i < 8 && dir is not null; i++)
    {
        if (Directory.Exists(Path.Combine(dir.FullName, "Datos"))) return dir.FullName;
        dir = dir.Parent;
    }
    return AppContext.BaseDirectory;
}

var appRoot = FindAppRoot();
var datosDir = Path.Combine(appRoot, "Datos");
var dbPath = Path.Combine(appRoot, "datos.db");
Directory.CreateDirectory(datosDir);

// Red de seguridad: si algo tumba el proceso entero (no una excepción
// normal de un endpoint, que ya cae en su propio try/catch, sino algo
// a nivel de runtime), queda constancia en un archivo junto al .exe en
// vez de perderse en cuanto se cierra la terminal/consola.
AppDomain.CurrentDomain.UnhandledException += (_, e) =>
{
    try
    {
        var msg = $"{DateTime.Now:o} — excepción no manejada (terminating={e.IsTerminating}):\n{e.ExceptionObject}\n\n";
        File.AppendAllText(Path.Combine(appRoot, "crash.log"), msg);
    }
    catch { /* si ni esto se puede escribir, no hay nada más que hacer */ }
};

var connStr = $"Data Source={dbPath}";

// ── Esquema SQLite ───────────────────────────────────────────────────────────
void EnsureSchema()
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = """
        CREATE TABLE IF NOT EXISTS Ceves (
            CodCeve TEXT PRIMARY KEY,
            Nombre TEXT, Region TEXT, Organizacion TEXT, AreaNegocio TEXT,
            Gerente TEXT, CorreoGerente TEXT, Subgerente TEXT, CorreoSubgerente TEXT,
            Coordinador TEXT, CorreoCoordinador TEXT, Direccion TEXT,
            Latitud TEXT, Longitud TEXT, CeveSinergia TEXT, TurnoLaboral TEXT,
            RTM TEXT, IntegralVending TEXT
        );
        CREATE TABLE IF NOT EXISTS CargasLog (
            Fuente TEXT PRIMARY KEY,
            Archivo TEXT, Filas INTEGER, CargadoEn TEXT
        );
        CREATE TABLE IF NOT EXISTS ProductosHub (
            OrgCode TEXT, ItemCode TEXT, MasterCode TEXT, ShortName TEXT, LongName TEXT, Price TEXT,
            Barcode TEXT, TrayCapacity TEXT, TrayChecking TEXT, ContainerCapacity TEXT, TrayCode TEXT,
            ContainerCode TEXT, ShelfLife TEXT, DaysLife TEXT, Brand TEXT, RoundingFactor TEXT,
            CategoryItem TEXT, BedsPerContainer TEXT, RoundingCap TEXT
        );
        CREATE TABLE IF NOT EXISTS CalendarioBimbo (
            Fecha TEXT PRIMARY KEY, Semana TEXT, Anio TEXT, Dia TEXT
        );
        CREATE TABLE IF NOT EXISTS CatPlantasCedis (
            Planta TEXT, Codigo TEXT, WH TEXT, CustomerName TEXT
        );
        CREATE TABLE IF NOT EXISTS PedidosCevePlanta (
            CodCeve TEXT, Item TEXT, Cantidad REAL, FechaOrden TEXT, FechaVenta TEXT
        );
        CREATE INDEX IF NOT EXISTS IX_PedidosCevePlanta_Fecha ON PedidosCevePlanta (FechaVenta);
        CREATE TABLE IF NOT EXISTS PedidosOracle (
            OrderNbr TEXT, ItemCode TEXT, ItemDescription TEXT, CustField3 TEXT, OrderedQty REAL,
            OrigOrderQty REAL, AllocatedQty REAL, PackedQty REAL, SalePrice REAL, CustomerPC TEXT,
            OrderStatus TEXT, OrderType TEXT, RequiredShipDate TEXT, CustName TEXT, OrderDate TEXT,
            ShipDate TEXT, DestinationId TEXT, Facility TEXT, OrderDtlStatus TEXT, Estado TEXT, Semana TEXT
        );
        CREATE INDEX IF NOT EXISTS IX_PedidosOracle_Fecha ON PedidosOracle (RequiredShipDate);
        CREATE TABLE IF NOT EXISTS ExistenciaCeveManual (
            FechaVenta TEXT, CodCeve TEXT, Item TEXT, Cantidad REAL
        );
        CREATE INDEX IF NOT EXISTS IX_ExistenciaCeveManual_Fecha ON ExistenciaCeveManual (FechaVenta);
        CREATE TABLE IF NOT EXISTS PedidoVsCargoReal (
            FechaVenta TEXT, CodCeve TEXT, Item TEXT, CargoPzs REAL, PedidoPzs REAL
        );
        CREATE INDEX IF NOT EXISTS IX_PedidoVsCargoReal_Fecha ON PedidoVsCargoReal (FechaVenta);
        -- Reporte ya sumarizado de CargoRutas (Pedido vs Cargo por CeVe/día/sistema),
        -- usado por Seguimiento Servicios para saber quién ya mandó su archivo.
        CREATE TABLE IF NOT EXISTS SeguimientoServicios (
            SCCode TEXT, DispatchDate TEXT, Sistema TEXT, PedidoVendedorPzs REAL, CargoPzs REAL,
            RutasUnicas REAL, ProductosUnicos REAL, Filas REAL, HoraEjecucionCdmx TEXT
        );
        CREATE INDEX IF NOT EXISTS IX_SeguimientoServicios_Fecha ON SeguimientoServicios (DispatchDate);
        CREATE TABLE IF NOT EXISTS ParticipacionTipoMovimiento (
            CodigoCeve TEXT, NombreCeve TEXT, Item TEXT, NombreProducto TEXT, Categoria TEXT, Marca TEXT,
            CargoTotalAnio REAL, PctParticipacion REAL, PctAcumulado REAL, ClasificacionABC TEXT,
            DiasConMovimientoUltMes INTEGER, TotalDiasUltMes INTEGER, PctDiasMovimientoUltMes REAL,
            ClasificacionXYZ TEXT, ClasificacionCombinada TEXT
        );
        -- Remisiones (embarques Planta/Cedis -> CeVe): texto, igual que en la app
        -- original, para no perder nada por un TRY_CONVERT que falle en silencio.
        CREATE TABLE IF NOT EXISTS RemisionesProductosCEQ (
            Remision TEXT, FechaCierreEmbarque TEXT, FechaVenta TEXT, OrigenId TEXT, Origen TEXT,
            DestinoId TEXT, Destino TEXT, Producto TEXT, Descripcion TEXT, CantidadEnviada REAL
        );
        CREATE INDEX IF NOT EXISTS IX_RemisionesProductosCEQ_Remision ON RemisionesProductosCEQ (Remision);
        CREATE TABLE IF NOT EXISTS CatCadenaSupministro (
            Semana TEXT, CodCeve TEXT, Item TEXT, Produce TEXT, Recoge TEXT, Distribuye TEXT, Linea TEXT
        );
        -- Resultados de Fill Rate: una sola ejecución vigente a la vez (se
        -- reemplaza completa en cada "Ejecutar"), simplificación razonable para
        -- una app de un solo usuario sin necesidad de guardar historial de corridas.
        CREATE TABLE IF NOT EXISTS FillRateResultados (
            CodigoCeve TEXT, NombreCeve TEXT, Region TEXT, Organizacion TEXT, Coordinador TEXT,
            Item TEXT, ShortName TEXT, LongName TEXT, Price REAL, TrayCapacity REAL, TrayCode TEXT,
            DaysLife REAL, Brand TEXT, CategoryItem TEXT, BedsPerContainer REAL,
            Semana TEXT, FechaVenta TEXT, OrigenId TEXT, OrigenCusN TEXT, FechaCierreEmbarqueMax TEXT,
            Produce TEXT, ProduceCusN TEXT, Recoge TEXT, RecogeCusN TEXT, Distribuye TEXT, DistribuyeCusN TEXT,
            OrigenEmbarque TEXT, Linea TEXT,
            PedidoCeve REAL, EmbarquePlantaCedis REAL, DiferenciaEnv REAL, RecorteEnv REAL, AumentoEnv REAL,
            EmbarqueSinAumentosEnv REAL, PedidoCevePiezas REAL, EmbarquePiezas REAL, DiferenciaPiezas REAL,
            RecortePiezas REAL, AumentoPiezas REAL, EmbarqueSinAumentosPiezas REAL,
            PedidoCeveImporte REAL, EmbarqueImporte REAL, DiferenciaImporte REAL, RecorteImporte REAL,
            AumentoImporte REAL, EmbarqueSinAumentosImporte REAL
        );
        CREATE INDEX IF NOT EXISTS IX_FillRateResultados_Fecha ON FillRateResultados (FechaVenta);
        CREATE TABLE IF NOT EXISTS ProcesosLog (
            Proceso TEXT PRIMARY KEY, Detalle TEXT, Filas INTEGER, EjecutadoEn TEXT
        );
        -- Extracto de inventario_resumen (Ivy): existencia física real, "automática"
        -- (alternativa a Existencia CeVe Manual). Snapshot por fecha_captura.
        CREATE TABLE IF NOT EXISTS InventarioResumen (
            CeveNombre TEXT, SkuCodigo TEXT, CantidadTotal REAL, FechaCaptura TEXT
        );
        CREATE INDEX IF NOT EXISTS IX_InventarioResumen_Fecha ON InventarioResumen (FechaCaptura);
        -- Extracto de Synapse: promedio/desviación histórica de pedido por CeVe+Item+Día.
        CREATE TABLE IF NOT EXISTS PedidoVendedorPromedios (
            CodCeve TEXT, Item TEXT, Dia TEXT, PromedioFinalPedido REAL, DesviacionStdPedido REAL, PromedioFinalCarga REAL
        );
        -- Extracto de OrderTowerDB: lead time y frecuencia de pedido por CeVe+Item+Día.
        CREATE TABLE IF NOT EXISTS FrecuenciasConsolidadas (
            CodCeve TEXT, Item TEXT, Dia TEXT, LeadTime INTEGER, FrecuenciaDias TEXT
        );
        -- Existencia Teórica: una ejecución por Fecha_Venta (volver a ejecutar la misma
        -- fecha reemplaza solo esa fecha, no las demás — Post-Mortem necesita poder
        -- encontrar ejecuciones de fechas pasadas).
        CREATE TABLE IF NOT EXISTS ExistenciaTeoricaEjecuciones (
            FechaSel TEXT PRIMARY KEY, BaseExistencia TEXT, Filas INTEGER, EjecutadoEn TEXT
        );
        CREATE TABLE IF NOT EXISTS ExistenciaTeoricaResultados (
            Cod_ceve TEXT, Nombre_Indicadores_Almacenes_CeVe TEXT, Region TEXT, Organizacion TEXT, Item TEXT,
            ShortName TEXT, LongName TEXT, Price REAL, TrayCapacity REAL, ContainerCapacity REAL, DaysLife REAL,
            Brand TEXT, CategoryItem TEXT, Fecha_Venta TEXT, Fecha_Proceso TEXT, Dia_Semana TEXT,
            LeadTime REAL, FrecuenciaDias TEXT, Fecha_Venta_Origen TEXT,
            Cantidad REAL, Existencia_manual_pzs REAL, Existencia_manual_env REAL,
            Fecha_Transito1 TEXT, Pedido_Fabrica1 REAL, CargoPromedio_Transito1 REAL, Existencia_teorica_1 REAL,
            Fecha_Transito2 TEXT, Pedido_Fabrica2 REAL, CargoPromedio_Transito2 REAL, Existencia_teorica_2 REAL,
            Fecha_Transito3 TEXT, Pedido_Fabrica3 REAL, CargoPromedio_Transito3 REAL, Existencia_teorica_3 REAL,
            Fecha_Transito4 TEXT, Pedido_Fabrica4 REAL, CargoPromedio_Transito4 REAL, Existencia_teorica_4 REAL,
            Fecha_Transito5 TEXT, Pedido_Fabrica5 REAL, CargoPromedio_Transito5 REAL, Existencia_teorica_5 REAL,
            Fecha_Transito6 TEXT, Pedido_Fabrica6 REAL, CargoPromedio_Transito6 REAL, Existencia_teorica_6 REAL,
            PromedioFinalPedido REAL, DesviacionStdPedido REAL, Estadistico REAL, Stock_Seguridad REAL,
            Inventario_Optimo REAL, Reposicion REAL, Diferencia_Pedido_Fabrica REAL
        );
        CREATE INDEX IF NOT EXISTS IX_ExistenciaTeoricaResultados_Fecha ON ExistenciaTeoricaResultados (Fecha_Venta);
        """;
    cmd.ExecuteNonQuery();
}
EnsureSchema();

// Post-Mortem tiene ~125 columnas (11 base + 19 por cada uno de los 6 días de
// tránsito) — se construye el nombre de cada columna en código en vez de
// escribir el CREATE TABLE a mano, para no arriesgar un desfase como el que
// ya pasó una vez con Fill Rate (45 vs 46 parámetros).
List<string> ColumnasPostMortem()
{
    var baseCols = new[] { "Cod_ceve", "Nombre_Indicadores_Almacenes_CeVe", "Region", "Organizacion", "Item", "ShortName", "Fecha_Venta", "Fecha_Proceso", "Dia_Semana", "Existencia_manual_env", "Inventario_Optimo" };
    var perDiaCols = new[] { "Fecha_Transito", "Pedido_Fabrica", "CargoPromedio_Transito", "Existencia_teorica_", "Embarque_Real", "Diferencia_env", "Recorte_env", "Aumento_env", "Embarque_Sin_Aumentos_env", "Cargo_pzs", "Cargo_espejo_pzs", "Cargo_total", "Pedido_pzs", "Pedido_espejo_pzs", "Pedido_total", "Existencia_Real", "Diferencia_Embarque", "Diferencia_Carga", "Diferencia_Existencia" };
    var cols = new List<string>(baseCols);
    for (int n = 1; n <= 6; n++) foreach (var c in perDiaCols) cols.Add($"{c}{n}");
    return cols;
}

void EnsurePostMortemSchema()
{
    var textCols = new HashSet<string> { "Cod_ceve", "Nombre_Indicadores_Almacenes_CeVe", "Region", "Organizacion", "Item", "ShortName", "Dia_Semana" };
    var colDefs = string.Join(", ", ColumnasPostMortem().Select(c =>
        textCols.Contains(c) || c.StartsWith("Fecha_") ? $"[{c}] TEXT" : $"[{c}] REAL"));
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = $"""
        CREATE TABLE IF NOT EXISTS PostMortemResultados ({colDefs});
        CREATE INDEX IF NOT EXISTS IX_PostMortemResultados_Fecha ON PostMortemResultados (Fecha_Venta);
        CREATE TABLE IF NOT EXISTS PostMortemEjecuciones (FechaVenta TEXT PRIMARY KEY, Filas INTEGER, EjecutadoEn TEXT);
        """;
    cmd.ExecuteNonQuery();
}
EnsurePostMortemSchema();

// Causas Recorte: igual patrón que Post-Mortem (nombres de columna generados
// en código, no a mano).
List<string> ColumnasCausasRecorte()
{
    var cols = new List<string> {
        "Codigo_CeVe", "CeVe", "RegionLogistica", "Fecha_Venta", "NombreDia", "Semana", "Item",
        "DescripcionProducto", "CategoriaResumida", "Marca", "NombreCanal", "Cupo", "Precio",
        "PedidoPzs", "PedidoUSD", "CargoPzs", "CargoUSD", "CargoSinAumentoPzs", "CargoSinAumentoUSD", "RecortePzs", "RecorteUSD",
        "Causa_Principal", "Causa_Secundaria", "Resumen", "Envs_Planta", "Envs_Consumo", "ExistenciaPzs",
    };
    var perDiaCols = new[] { "Fecha_Transito", "Pedido_Fabrica", "Embarque_Real", "Cargo_Real", "Cargo_Promedio" };
    for (int n = 1; n <= 6; n++) foreach (var c in perDiaCols) cols.Add($"{c}{n}");
    cols.AddRange(new[] { "Hoy_Pedido", "Hoy_Entregado", "Hoy_PedidoConsumo", "Hoy_CargoPromedioConsumo" });
    return cols;
}

void EnsureCausasRecorteSchema()
{
    var textCols = new HashSet<string> { "Codigo_CeVe", "CeVe", "RegionLogistica", "NombreDia", "Item", "DescripcionProducto", "CategoriaResumida", "Marca", "NombreCanal", "Causa_Principal", "Causa_Secundaria", "Resumen" };
    var colDefs = string.Join(", ", ColumnasCausasRecorte().Select(c =>
        textCols.Contains(c) || c.StartsWith("Fecha_") ? $"[{c}] TEXT" : $"[{c}] REAL"));
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = $"""
        CREATE TABLE IF NOT EXISTS CausasRecorteResultados ({colDefs});
        CREATE INDEX IF NOT EXISTS IX_CausasRecorteResultados_Fecha ON CausasRecorteResultados (Fecha_Venta);
        CREATE TABLE IF NOT EXISTS CausasRecorteEjecuciones (Archivo TEXT PRIMARY KEY, FechaMin TEXT, FechaMax TEXT, Filas INTEGER, EjecutadoEn TEXT);
        """;
    cmd.ExecuteNonQuery();
}
EnsureCausasRecorteSchema();

// Cálculo Inventario Óptimo: mismo patrón de columnas generadas en código.
List<string> ColumnasInventarioOptimo() => new List<string> {
    "Fecha_venta", "SCCode", "ItemOrg", "Exist_lv_pzs_CE", "Exist_lv_pzs_CN", "Exist_lvy_pzs_CE", "Exist_lvy_pzs_CN",
    "Exist_total_ivy", "Exist_total_iv", "Exis_Total",
    "dia", "semana", "anio", "nombre_ceve", "region", "organizacion",
    "nombre_producto", "marca", "categoria", "precio", "cupo", "cupo_contenedor", "tipo_envase", "tipo_vida", "dias_vida",
    "tipo_part", "tipo_mov", "cargoprom_env", "cargoprom_pzs", "desv_standar", "desv_standar_pzs", "leadtime", "frecuencia", "Factor",
    "Promedio_semanal", "Promedio_semanal_pzs", "ss", "Invopt",
};

void EnsureInventarioOptimoSchema()
{
    var textCols = new HashSet<string> { "Fecha_venta", "SCCode", "ItemOrg", "dia", "nombre_ceve", "region", "organizacion", "nombre_producto", "marca", "categoria", "tipo_envase", "tipo_vida", "tipo_part", "tipo_mov", "frecuencia" };
    var colDefs = string.Join(", ", ColumnasInventarioOptimo().Select(c => textCols.Contains(c) ? $"[{c}] TEXT" : $"[{c}] REAL"));
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = $"""
        CREATE TABLE IF NOT EXISTS InventarioOptimoResultados ({colDefs});
        CREATE INDEX IF NOT EXISTS IX_InventarioOptimoResultados_Fecha ON InventarioOptimoResultados (Fecha_venta);
        CREATE TABLE IF NOT EXISTS InventarioOptimoEjecuciones (Archivo TEXT PRIMARY KEY, FechaMin TEXT, FechaMax TEXT, Filas INTEGER, EjecutadoEn TEXT);
        """;
    cmd.ExecuteNonQuery();
}
EnsureInventarioOptimoSchema();

// ── Carga de catálogos desde Datos/ ─────────────────────────────────────────
// Convención v1, simple a propósito: el CSV que esté hoy en la carpeta de cada
// catálogo ES el catálogo vigente (se reemplaza completo en cada recarga). Si
// hay varios archivos, se usa el modificado más recientemente.
static string[] SplitCsvLine(string line)
{
    var fields = new List<string>();
    var cur = new System.Text.StringBuilder();
    bool inQ = false;
    for (int i = 0; i < line.Length; i++)
    {
        char ch = line[i];
        if (inQ)
        {
            if (ch == '"' && i + 1 < line.Length && line[i + 1] == '"') { cur.Append('"'); i++; }
            else if (ch == '"') inQ = false;
            else cur.Append(ch);
        }
        else
        {
            if (ch == '"') inQ = true;
            else if (ch == ',') { fields.Add(cur.ToString().Trim()); cur.Clear(); }
            else cur.Append(ch);
        }
    }
    fields.Add(cur.ToString().Trim());
    return fields.ToArray();
}

string? UltimoArchivoCsv(string carpeta)
{
    if (!Directory.Exists(carpeta)) return null;
    return Directory.GetFiles(carpeta, "*.csv")
        .OrderByDescending(f => File.GetLastWriteTimeUtc(f))
        .FirstOrDefault();
}

ResultadoCarga CargarCeves()
{
    var carpeta = Path.Combine(datosDir, "Catalogos", "CEVEs");
    var archivo = UltimoArchivoCsv(carpeta);
    if (archivo is null) return new ResultadoCarga(true, "Sin archivo CSV en Datos/Catalogos/CEVEs — se deja el catálogo como está.", 0);

    var cols = new[] {
        "Cod_ceve", "Nombre_Indicadores_Almacenes_CeVe", "Region", "Organizacion",
        "Area_Negocio", "Gerente", "Correo_Gerente", "Subgerente", "Correo_Subgerente",
        "Coordinador", "Correo_Coordinador", "Direccion", "Latitud", "Longitud",
        "CeVe_Sinergia", "Turno_Laboral",
    };
    var alias = new Dictionary<string, string> {
        ["Organización"] = "Organizacion", ["Área_Negocio"] = "Area_Negocio", ["Turno Laboral"] = "Turno_Laboral",
    };

    var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
    if (lines.Length < 2) return new ResultadoCarga(false, $"'{Path.GetFileName(archivo)}' está vacío.", 0);

    var headers = SplitCsvLine(lines[0]).Select(h => alias.TryGetValue(h.Trim(), out var a) ? a : h.Trim()).ToArray();
    var faltantes = cols.Where(c => !headers.Contains(c)).ToArray();
    if (faltantes.Length > 0)
        return new ResultadoCarga(false, $"'{Path.GetFileName(archivo)}': faltan columnas: {string.Join(", ", faltantes)}.", 0);

    var idx = cols.ToDictionary(c => c, c => Array.IndexOf(headers, c));
    // RTM / Integral Vending: opcionales -- no vienen de ningún extracto, son dos
    // banderas que se mantienen a mano agregando estas columnas al CSV cuando se
    // quiera cambiarlas. Si no están, igual que el original: RTM arranca Activo
    // para todos, Integral Vending Inactivo.
    int idxRtm = Array.IndexOf(headers, "RTM");
    int idxIv = Array.IndexOf(headers, "Integral_Vending");

    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var tx = conn.BeginTransaction();

    using (var del = conn.CreateCommand()) { del.CommandText = "DELETE FROM Ceves"; del.Transaction = tx; del.ExecuteNonQuery(); }

    int filas = 0;
    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    ins.CommandText = """
        INSERT OR REPLACE INTO Ceves
            (CodCeve, Nombre, Region, Organizacion, AreaNegocio, Gerente, CorreoGerente,
             Subgerente, CorreoSubgerente, Coordinador, CorreoCoordinador, Direccion,
             Latitud, Longitud, CeveSinergia, TurnoLaboral, RTM, IntegralVending)
        VALUES ($cod,$nombre,$region,$org,$area,$ger,$cger,$sub,$csub,$coord,$ccoord,$dir,$lat,$lon,$sin,$turno,$rtm,$iv)
        """;
    // Nombres de parámetro cortos y fijos (evita depender del nombre de columna CSV).
    var pmap = new (string col, string param)[] {
        ("Cod_ceve","$cod"), ("Nombre_Indicadores_Almacenes_CeVe","$nombre"), ("Region","$region"),
        ("Organizacion","$org"), ("Area_Negocio","$area"), ("Gerente","$ger"), ("Correo_Gerente","$cger"),
        ("Subgerente","$sub"), ("Correo_Subgerente","$csub"), ("Coordinador","$coord"),
        ("Correo_Coordinador","$ccoord"), ("Direccion","$dir"), ("Latitud","$lat"), ("Longitud","$lon"),
        ("CeVe_Sinergia","$sin"), ("Turno_Laboral","$turno"),
    };
    foreach (var (_, param) in pmap) ins.Parameters.Add(new SqliteParameter(param, ""));
    ins.Parameters.Add(new SqliteParameter("$rtm", "Activo"));
    ins.Parameters.Add(new SqliteParameter("$iv", "Inactivo"));

    for (int i = 1; i < lines.Length; i++)
    {
        var vals = SplitCsvLine(lines[i]);
        string Val(string col) { var j = idx[col]; return j >= 0 && j < vals.Length ? vals[j] : ""; }
        if (string.IsNullOrWhiteSpace(Val("Cod_ceve"))) continue;

        foreach (var (col, param) in pmap) ins.Parameters[param]!.Value = Val(col);
        ins.Parameters["$rtm"]!.Value = idxRtm >= 0 && idxRtm < vals.Length && vals[idxRtm].Length > 0 ? vals[idxRtm] : "Activo";
        ins.Parameters["$iv"]!.Value = idxIv >= 0 && idxIv < vals.Length && vals[idxIv].Length > 0 ? vals[idxIv] : "Inactivo";
        ins.ExecuteNonQuery();
        filas++;
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO CargasLog (Fuente, Archivo, Filas, CargadoEn) VALUES ('CEVEs', $a, $f, $c)";
        log.Parameters.AddWithValue("$a", Path.GetFileName(archivo));
        log.Parameters.AddWithValue("$f", filas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }

    tx.Commit();
    return new ResultadoCarga(true, $"'{Path.GetFileName(archivo)}': {filas:N0} CeVes cargados.", filas);
}

// ── Loader genérico de catálogos (reemplaza la tabla completa en cada carga) ─
ResultadoCarga CargarCatalogoGenerico(
    string fuente, string tabla, string carpetaRel,
    (string csv, string sql)[] columnas,
    Dictionary<string, string>? alias = null,
    Func<string, string, string>? transformar = null)
{
    var carpeta = Path.Combine(datosDir, carpetaRel);
    var archivo = UltimoArchivoCsv(carpeta);
    if (archivo is null) return new ResultadoCarga(true, $"Sin archivo CSV en Datos/{carpetaRel} — se deja '{fuente}' como está.", 0);

    var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
    if (lines.Length < 2) return new ResultadoCarga(false, $"'{Path.GetFileName(archivo)}' está vacío.", 0);

    var headers = SplitCsvLine(lines[0]).Select(h => alias != null && alias.TryGetValue(h.Trim(), out var a) ? a : h.Trim()).ToArray();
    var faltantes = columnas.Where(c => !headers.Contains(c.csv)).Select(c => c.csv).ToArray();
    if (faltantes.Length > 0)
        return new ResultadoCarga(false, $"'{Path.GetFileName(archivo)}' ({fuente}): faltan columnas: {string.Join(", ", faltantes)}.", 0);

    var idx = columnas.Select(c => Array.IndexOf(headers, c.csv)).ToArray();

    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var tx = conn.BeginTransaction();

    using (var del = conn.CreateCommand()) { del.CommandText = $"DELETE FROM {tabla}"; del.Transaction = tx; del.ExecuteNonQuery(); }

    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    var paramNames = columnas.Select((c, i) => "$p" + i).ToArray();
    ins.CommandText = $"INSERT INTO {tabla} ({string.Join(",", columnas.Select(c => c.sql))}) VALUES ({string.Join(",", paramNames)})";
    foreach (var pn in paramNames) ins.Parameters.Add(new SqliteParameter(pn, ""));

    int filas = 0;
    for (int i = 1; i < lines.Length; i++)
    {
        var vals = SplitCsvLine(lines[i]);
        if (vals.All(string.IsNullOrWhiteSpace)) continue;
        for (int c = 0; c < columnas.Length; c++)
        {
            var j = idx[c];
            var raw = j >= 0 && j < vals.Length ? vals[j] : "";
            ins.Parameters[c].Value = transformar is null ? raw : transformar(columnas[c].sql, raw);
        }
        ins.ExecuteNonQuery();
        filas++;
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO CargasLog (Fuente, Archivo, Filas, CargadoEn) VALUES ($f, $a, $n, $c)";
        log.Parameters.AddWithValue("$f", fuente);
        log.Parameters.AddWithValue("$a", Path.GetFileName(archivo));
        log.Parameters.AddWithValue("$n", filas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }

    tx.Commit();
    return new ResultadoCarga(true, $"'{Path.GetFileName(archivo)}': {filas:N0} filas cargadas en {fuente}.", filas);
}

// dd/MM/yyyy -> yyyy-MM-dd, para poder comparar/ordenar fechas como texto.
static string FechaDmyAIso(string s)
{
    s = s.Trim();
    var m = System.Text.RegularExpressions.Regex.Match(s, @"^(\d{1,2})/(\d{1,2})/(\d{4})$");
    return m.Success ? $"{m.Groups[3].Value}-{m.Groups[2].Value.PadLeft(2, '0')}-{m.Groups[1].Value.PadLeft(2, '0')}" : s;
}

ResultadoCarga CargarProductosHub() => CargarCatalogoGenerico("Productos HubPedidos", "ProductosHub", "Catalogos/ProductosHubPedidos", new (string, string)[] {
    ("OrgCode","OrgCode"), ("ItemCode","ItemCode"), ("MasterCode","MasterCode"), ("ShortName","ShortName"),
    ("LongName","LongName"), ("Price","Price"), ("Barcode","Barcode"), ("TrayCapacity","TrayCapacity"),
    ("TrayChecking","TrayChecking"), ("ContainerCapacity","ContainerCapacity"), ("TrayCode","TrayCode"),
    ("ContainerCode","ContainerCode"), ("ShelfLife","ShelfLife"), ("DaysLife","DaysLife"), ("Brand","Brand"),
    ("RoundingFactor","RoundingFactor"), ("CategoryItem","CategoryItem"), ("BedsPerContainer","BedsPerContainer"),
    ("RoundingCap","RoundingCap"),
});

ResultadoCarga CargarCalendario() => CargarCatalogoGenerico("Calendario", "CalendarioBimbo", "Catalogos/Calendario", new (string, string)[] {
    ("Fecha","Fecha"), ("Semana","Semana"), ("Año","Anio"), ("Día","Dia"),
}, transformar: (sql, raw) => sql == "Fecha" ? FechaDmyAIso(raw) : raw);

ResultadoCarga CargarPlantasCedis() => CargarCatalogoGenerico("Plantas / Cedis", "CatPlantasCedis", "Catalogos/Plantas", new (string, string)[] {
    ("Planta","Planta"), ("CODIGO","Codigo"), ("WH","WH"), ("CUSTOMER_NAME","CustomerName"),
});

// yyyy-MM-dd, dd/MM/yyyy, d/M/yyyy, yyyy/MM/dd -> yyyy-MM-dd (o "" si no se reconoce).
static string NormalizarFechaIso(string s)
{
    s = s.Trim();
    foreach (var fmt in new[] { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "yyyy/MM/dd" })
        if (DateTime.TryParseExact(s, fmt, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out var d))
            return d.ToString("yyyy-MM-dd");
    return "";
}

static object? ParseNum(string s)
{
    s = s.Trim();
    return decimal.TryParse(s, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var v) ? (object)v : null;
}

static object? ParseTxt(string s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

// ── Loader genérico de cargas transaccionales por fecha ─────────────────────
// A diferencia de los catálogos (que se reemplazan completos), aquí se
// acumula historia: se procesan TODOS los CSV nuevos de la carpeta (no solo
// el más reciente), para cada uno se borra el rango de fechas que cubre
// (evita duplicar si se vuelve a soltar el mismo archivo) y se insertan sus
// filas; el archivo procesado se mueve a Datos/_Procesados/<misma carpeta>
// para no reprocesarlo en la siguiente recarga. Sin validación de encabezado
// (igual que el sistema original): la primera línea se descarta y las demás
// se leen por posición fija de columna.
ResultadoCarga CargarTransaccionalPorFecha(
    string fuente, string tabla, string carpetaRel, int colFechaIdx,
    (string sql, Func<string, object?> parse)[] columnas,
    string[]? headerEsperado = null)
{
    var carpeta = Path.Combine(datosDir, carpetaRel);
    if (!Directory.Exists(carpeta)) return new ResultadoCarga(true, $"Sin carpeta Datos/{carpetaRel} — se deja '{fuente}' como está.", 0);
    var archivos = Directory.GetFiles(carpeta, "*.csv").OrderBy(f => f).ToArray();
    if (archivos.Length == 0) return new ResultadoCarga(true, $"Sin archivos nuevos para '{fuente}'.", 0);

    var procesadosDir = Path.Combine(datosDir, "_Procesados", carpetaRel);
    Directory.CreateDirectory(procesadosDir);

    using var conn = new SqliteConnection(connStr);
    conn.Open();

    int totalFilas = 0;
    var archivosOk = new List<string>();
    var archivosConError = new List<string>();
    foreach (var archivo in archivos)
    {
        var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
        if (lines.Length == 0) continue;

        // Validación de encabezado: el parseo de abajo es puramente posicional
        // (columna 0, 1, 2…), así que un archivo con otra cantidad de columnas
        // (p.ej. soltar por error el extracto de Inventario Óptimo, de 10
        // columnas, en una carpeta que espera 4) se leería "bien" pero con
        // valores corridos/sin sentido, sin ningún aviso. Se rechaza en vez de
        // adivinar.
        var headerCsv = SplitCsvLine(lines[0]).Select(h => h.Trim()).ToArray();
        if (headerCsv.Length != columnas.Length)
        {
            archivosConError.Add(
                $"'{Path.GetFileName(archivo)}' tiene {headerCsv.Length} columna(s) y '{fuente}' espera {columnas.Length}" +
                (headerEsperado != null ? $" ({string.Join(",", headerEsperado)})" : "") +
                " — no se procesó, revisa que sea el archivo correcto.");
            continue;
        }
        if (headerEsperado != null &&
            !headerEsperado.Where((h, i) => !string.Equals(headerCsv[i], h, StringComparison.OrdinalIgnoreCase)).Any() == false)
        {
            archivosConError.Add(
                $"'{Path.GetFileName(archivo)}' no trae las columnas esperadas para '{fuente}' " +
                $"({string.Join(",", headerEsperado)}) — no se procesó, revisa que sea el archivo correcto.");
            continue;
        }

        var filasParseadas = new List<object?[]>();
        string? fechaMin = null, fechaMax = null;
        for (int i = 1; i < lines.Length; i++)
        {
            var f = SplitCsvLine(lines[i]);
            if (f.Length < columnas.Length) continue;
            var vals = new object?[columnas.Length];
            for (int c = 0; c < columnas.Length; c++) vals[c] = columnas[c].parse(f[c]);
            filasParseadas.Add(vals);
            var fv = colFechaIdx >= 0 ? vals[colFechaIdx] as string : null;
            if (!string.IsNullOrEmpty(fv))
            {
                if (fechaMin is null || string.CompareOrdinal(fv, fechaMin) < 0) fechaMin = fv;
                if (fechaMax is null || string.CompareOrdinal(fv, fechaMax) > 0) fechaMax = fv;
            }
        }

        using (var tx = conn.BeginTransaction())
        {
            if (fechaMin != null && fechaMax != null)
            {
                using var del = conn.CreateCommand();
                del.Transaction = tx;
                del.CommandText = $"DELETE FROM {tabla} WHERE {columnas[colFechaIdx].sql} BETWEEN $d1 AND $d2";
                del.Parameters.AddWithValue("$d1", fechaMin);
                del.Parameters.AddWithValue("$d2", fechaMax);
                del.ExecuteNonQuery();
            }

            using var ins = conn.CreateCommand();
            ins.Transaction = tx;
            var paramNames = columnas.Select((c, i) => "$p" + i).ToArray();
            ins.CommandText = $"INSERT INTO {tabla} ({string.Join(",", columnas.Select(c => c.sql))}) VALUES ({string.Join(",", paramNames)})";
            foreach (var pn in paramNames) ins.Parameters.Add(new SqliteParameter(pn, DBNull.Value));
            foreach (var vals in filasParseadas)
            {
                for (int c = 0; c < vals.Length; c++) ins.Parameters[c].Value = vals[c] ?? DBNull.Value;
                ins.ExecuteNonQuery();
            }
            tx.Commit();
        }

        totalFilas += filasParseadas.Count;
        archivosOk.Add(Path.GetFileName(archivo));
        var destino = Path.Combine(procesadosDir, Path.GetFileName(archivo));
        if (File.Exists(destino)) File.Delete(destino);
        File.Move(archivo, destino);
    }

    if (archivosOk.Count > 0)
        using (var log = conn.CreateCommand())
        {
            log.CommandText = "INSERT OR REPLACE INTO CargasLog (Fuente, Archivo, Filas, CargadoEn) VALUES ($f,$a,$n,$c)";
            log.Parameters.AddWithValue("$f", fuente);
            log.Parameters.AddWithValue("$a", string.Join(", ", archivosOk));
            log.Parameters.AddWithValue("$n", totalFilas);
            log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
            log.ExecuteNonQuery();
        }

    var partes = new List<string>();
    if (archivosOk.Count > 0) partes.Add($"{archivosOk.Count} archivo(s) procesados, {totalFilas:N0} filas en {fuente}.");
    partes.AddRange(archivosConError);
    if (partes.Count == 0) partes.Add($"Sin archivos nuevos para '{fuente}'.");

    return new ResultadoCarga(archivosConError.Count == 0, string.Join(" ", partes), totalFilas);
}

ResultadoCarga CargarPedidoCevePlanta() => CargarTransaccionalPorFecha("Pedido CeVe a Planta/Cedis", "PedidosCevePlanta", "Cargas/PedidoCevePlanta", 4, new (string, Func<string, object?>)[] {
    ("CodCeve", ParseTxt), ("Item", ParseTxt), ("Cantidad", ParseNum),
    ("FechaOrden", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? v : null; }),
    ("FechaVenta", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? (object)v : ""; }),
});

ResultadoCarga CargarPedidoOracle() => CargarTransaccionalPorFecha("Pedido Oracle", "PedidosOracle", "Cargas/PedidoOracle", 12, new (string, Func<string, object?>)[] {
    ("OrderNbr", ParseTxt), ("ItemCode", ParseTxt), ("ItemDescription", ParseTxt), ("CustField3", ParseTxt),
    ("OrderedQty", ParseNum), ("OrigOrderQty", ParseNum), ("AllocatedQty", ParseNum), ("PackedQty", ParseNum),
    ("SalePrice", ParseNum), ("CustomerPC", ParseTxt), ("OrderStatus", ParseTxt), ("OrderType", ParseTxt),
    ("RequiredShipDate", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? (object)v : ""; }),
    ("CustName", ParseTxt), ("OrderDate", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? v : null; }),
    ("ShipDate", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? v : null; }),
    ("DestinationId", ParseTxt), ("Facility", ParseTxt), ("OrderDtlStatus", ParseTxt), ("Estado", ParseTxt), ("Semana", ParseTxt),
});

ResultadoCarga CargarExistenciaCeveManual() => CargarTransaccionalPorFecha("Existencia CeVe Manual", "ExistenciaCeveManual", "Cargas/ExistenciaCeveManual", 0, new (string, Func<string, object?>)[] {
    ("FechaVenta", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? (object)v : ""; }),
    ("CodCeve", ParseTxt), ("Item", ParseTxt), ("Cantidad", ParseNum),
}, headerEsperado: new[] { "fecha_venta", "cod_ceve", "item", "cantidad" });

ResultadoCarga CargarPedidoVsCargoReal() => CargarTransaccionalPorFecha("PedidoVSCargo Real", "PedidoVsCargoReal", "Cargas/PedidoVsCargoReal", 0, new (string, Func<string, object?>)[] {
    ("FechaVenta", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? (object)v : ""; }),
    ("CodCeve", ParseTxt), ("Item", ParseTxt), ("CargoPzs", ParseNum), ("PedidoPzs", ParseNum),
}, headerEsperado: new[] { "fecha_venta", "cod_ceve", "item", "cargo_pzs", "pedido_pzs" });

// Seguimiento Servicios: reporte ya sumarizado de CargoRutas, una fila por
// SCCode+DispatchDate+Sistema (System='IVY' es RTM, 'IV' es Integral Vending).
ResultadoCarga CargarSeguimientoServicios() => CargarTransaccionalPorFecha("Seguimiento Servicios", "SeguimientoServicios", "Cargas/SeguimientoServicios", 1, new (string, Func<string, object?>)[] {
    ("SCCode", ParseTxt), ("DispatchDate", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? (object)v : ""; }),
    ("Sistema", ParseTxt), ("PedidoVendedorPzs", ParseNum), ("CargoPzs", ParseNum),
    ("RutasUnicas", ParseNum), ("ProductosUnicos", ParseNum), ("Filas", ParseNum), ("HoraEjecucionCdmx", ParseTxt),
}, headerEsperado: new[] { "SCCode", "DispatchDate", "System", "Pedido_Vendedor_pzs", "Cargo_pzs", "Rutas_Unicas", "Productos_Unicos", "Filas", "Hora_Ejecucion_CDMX" });

// Participación - Tipo Movimiento no trae fecha (es una clasificación ABC/XYZ
// vigente, no una serie histórica): se trata como catálogo, el CSV más
// reciente reemplaza la tabla completa. Tampoco valida encabezado (igual que
// el sistema original): primera línea se descarta, el resto se lee por
// posición fija.
ResultadoCarga CargarParticipacionTipoMovimiento()
{
    var carpeta = Path.Combine(datosDir, "Cargas/ParticipacionTipoMovimiento");
    var archivo = UltimoArchivoCsv(carpeta);
    if (archivo is null) return new ResultadoCarga(true, "Sin archivo CSV en Datos/Cargas/ParticipacionTipoMovimiento — se deja como está.", 0);

    var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
    if (lines.Length < 2) return new ResultadoCarga(false, $"'{Path.GetFileName(archivo)}' está vacío.", 0);

    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var tx = conn.BeginTransaction();
    using (var del = conn.CreateCommand()) { del.CommandText = "DELETE FROM ParticipacionTipoMovimiento"; del.Transaction = tx; del.ExecuteNonQuery(); }

    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    ins.CommandText = """
        INSERT INTO ParticipacionTipoMovimiento
            (CodigoCeve,NombreCeve,Item,NombreProducto,Categoria,Marca,CargoTotalAnio,PctParticipacion,
             PctAcumulado,ClasificacionABC,DiasConMovimientoUltMes,TotalDiasUltMes,PctDiasMovimientoUltMes,
             ClasificacionXYZ,ClasificacionCombinada)
        VALUES ($p0,$p1,$p2,$p3,$p4,$p5,$p6,$p7,$p8,$p9,$p10,$p11,$p12,$p13,$p14)
        """;
    for (int c = 0; c < 15; c++) ins.Parameters.Add(new SqliteParameter("$p" + c, DBNull.Value));

    int filas = 0;
    for (int i = 1; i < lines.Length; i++)
    {
        var f = SplitCsvLine(lines[i]);
        if (f.Length < 15) continue;
        ins.Parameters[0].Value = ParseTxt(f[0]) ?? DBNull.Value;
        ins.Parameters[1].Value = ParseTxt(f[1]) ?? DBNull.Value;
        ins.Parameters[2].Value = ParseTxt(f[2]) ?? DBNull.Value;
        ins.Parameters[3].Value = ParseTxt(f[3]) ?? DBNull.Value;
        ins.Parameters[4].Value = ParseTxt(f[4]) ?? DBNull.Value;
        ins.Parameters[5].Value = ParseTxt(f[5]) ?? DBNull.Value;
        ins.Parameters[6].Value = ParseNum(f[6]) ?? DBNull.Value;
        ins.Parameters[7].Value = ParseNum(f[7]) ?? DBNull.Value;
        ins.Parameters[8].Value = ParseNum(f[8]) ?? DBNull.Value;
        ins.Parameters[9].Value = ParseTxt(f[9]) ?? DBNull.Value;
        ins.Parameters[10].Value = ParseNum(f[10]) ?? DBNull.Value;
        ins.Parameters[11].Value = ParseNum(f[11]) ?? DBNull.Value;
        ins.Parameters[12].Value = ParseNum(f[12]) ?? DBNull.Value;
        ins.Parameters[13].Value = ParseTxt(f[13]) ?? DBNull.Value;
        ins.Parameters[14].Value = ParseTxt(f[14]) ?? DBNull.Value;
        ins.ExecuteNonQuery();
        filas++;
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO CargasLog (Fuente, Archivo, Filas, CargadoEn) VALUES ('Participación - Tipo Movimiento', $a, $n, $c)";
        log.Parameters.AddWithValue("$a", Path.GetFileName(archivo));
        log.Parameters.AddWithValue("$n", filas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }

    tx.Commit();
    return new ResultadoCarga(true, $"'{Path.GetFileName(archivo)}': {filas:N0} filas cargadas en Participación - Tipo Movimiento.", filas);
}

ResultadoCarga CargarCatCadenaSupministro() => CargarCatalogoGenerico("Catálogo Cadena Suministro", "CatCadenaSupministro", "Catalogos/CadenaSuministro", new (string, string)[] {
    ("Semana","Semana"), ("Cod_ceve","CodCeve"), ("Item","Item"), ("Produce","Produce"),
    ("Recoge","Recoge"), ("Distribuye","Distribuye"), ("Linea","Linea"),
});

// Remisiones (embarques): a diferencia de las cargas por fecha, aquí se
// deduplica por número de Remisión (igual que en la app original) — un mismo
// archivo se puede volver a soltar sin duplicar, y dos archivos con
// remisiones distintas simplemente se acumulan. Se procesan todos los CSV
// nuevos de la carpeta, cada uno se mueve a _Procesados al terminar.
ResultadoCarga CargarRemisiones()
{
    var carpeta = Path.Combine(datosDir, "Procesos/FillRate/Remisiones");
    if (!Directory.Exists(carpeta)) return new ResultadoCarga(true, "Sin carpeta Datos/Procesos/FillRate/Remisiones — se deja como está.", 0);
    var archivos = Directory.GetFiles(carpeta, "*.csv").OrderBy(f => f).ToArray();
    if (archivos.Length == 0) return new ResultadoCarga(true, "Sin archivos nuevos para 'Remisiones'.", 0);

    var cols = new[] { "Remision", "FechaCierreEmbarque", "FechaVenta", "OrigenId", "Origen", "DestinoId", "Destino", "Producto", "Descripcion", "CantidadEnviada" };
    var procesadosDir = Path.Combine(datosDir, "_Procesados", "Procesos/FillRate/Remisiones");
    Directory.CreateDirectory(procesadosDir);

    using var conn = new SqliteConnection(connStr);
    conn.Open();

    int totalFilas = 0;
    var archivosOk = new List<string>();
    foreach (var archivo in archivos)
    {
        var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
        if (lines.Length < 2) { archivosOk.Add(Path.GetFileName(archivo)); File.Move(archivo, Path.Combine(procesadosDir, Path.GetFileName(archivo)), true); continue; }

        var headers = SplitCsvLine(lines[0]).Select(h => h.Trim()).ToArray();
        var idx = cols.Select(c => Array.IndexOf(headers, c)).ToArray();
        if (idx.Any(i => i < 0))
            return new ResultadoCarga(false, $"'{Path.GetFileName(archivo)}' (Remisiones): faltan columnas: {string.Join(", ", cols.Where((c, i) => idx[i] < 0))}.", 0);

        var remisiones = new HashSet<string>();
        var filasParseadas = new List<string[]>();
        for (int i = 1; i < lines.Length; i++)
        {
            var f = SplitCsvLine(lines[i]);
            if (f.Length < headers.Length) continue;
            var vals = idx.Select(j => f[j]).ToArray();
            filasParseadas.Add(vals);
            if (!string.IsNullOrWhiteSpace(vals[0])) remisiones.Add(vals[0].Trim());
        }

        using (var tx = conn.BeginTransaction())
        {
            if (remisiones.Count > 0)
            {
                using var del = conn.CreateCommand();
                del.Transaction = tx;
                var ps = remisiones.Select((_, i) => "$r" + i).ToArray();
                del.CommandText = $"DELETE FROM RemisionesProductosCEQ WHERE Remision IN ({string.Join(",", ps)})";
                int i2 = 0; foreach (var r in remisiones) del.Parameters.AddWithValue(ps[i2++], r);
                del.ExecuteNonQuery();
            }

            using var ins = conn.CreateCommand();
            ins.Transaction = tx;
            ins.CommandText = "INSERT INTO RemisionesProductosCEQ (Remision,FechaCierreEmbarque,FechaVenta,OrigenId,Origen,DestinoId,Destino,Producto,Descripcion,CantidadEnviada) VALUES ($p0,$p1,$p2,$p3,$p4,$p5,$p6,$p7,$p8,$p9)";
            for (int c = 0; c < cols.Length; c++) ins.Parameters.Add(new SqliteParameter("$p" + c, DBNull.Value));
            foreach (var vals in filasParseadas)
            {
                for (int c = 0; c < cols.Length; c++)
                    ins.Parameters[c].Value = c switch
                    {
                        9 => ParseNum(vals[c]) ?? DBNull.Value,
                        1 or 2 => (object)(NormalizarFechaIso(vals[c]) is { Length: > 0 } iso ? iso : vals[c].Trim()),
                        _ => ParseTxt(vals[c]) ?? DBNull.Value,
                    };
                ins.ExecuteNonQuery();
            }
            tx.Commit();
        }

        totalFilas += filasParseadas.Count;
        archivosOk.Add(Path.GetFileName(archivo));
        var destino = Path.Combine(procesadosDir, Path.GetFileName(archivo));
        if (File.Exists(destino)) File.Delete(destino);
        File.Move(archivo, destino);
    }

    using (var log = conn.CreateCommand())
    {
        log.CommandText = "INSERT OR REPLACE INTO CargasLog (Fuente, Archivo, Filas, CargadoEn) VALUES ('Remisiones (Fill Rate)', $a,$n,$c)";
        log.Parameters.AddWithValue("$a", string.Join(", ", archivosOk));
        log.Parameters.AddWithValue("$n", totalFilas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }

    return new ResultadoCarga(true, $"{archivosOk.Count} archivo(s) procesados, {totalFilas:N0} filas en Remisiones (Fill Rate).", totalFilas);
}

ResultadoCarga CargarPedidoVendedorPromedios() => CargarCatalogoGenerico("Promedios de Pedido (Synapse)", "PedidoVendedorPromedios", "Catalogos/PromediosPedido", new (string, string)[] {
    ("Cod_CeVe","CodCeve"), ("Item","Item"), ("Dia","Dia"), ("PromedioFinalPedido","PromedioFinalPedido"),
    ("DesviacionStdPedido","DesviacionStdPedido"), ("PromedioFinalCarga","PromedioFinalCarga"),
});

ResultadoCarga CargarFrecuenciasConsolidadas() => CargarCatalogoGenerico("Frecuencias Producto CeVes (OrderTower)", "FrecuenciasConsolidadas", "Catalogos/FrecuenciasProductoCeves", new (string, string)[] {
    ("Cod_ceve","CodCeve"), ("Item","Item"), ("Dia","Dia"), ("LeadTime","LeadTime"), ("FrecuenciaDias","FrecuenciaDias"),
});

// Existencia física real (extracto de inventario_resumen/Ivy): snapshot por
// fecha_captura, igual patrón que las demás cargas por fecha.
ResultadoCarga CargarInventarioResumen() => CargarTransaccionalPorFecha("Inventario Resumen (Ivy)", "InventarioResumen", "Cargas/InventarioResumen", 3, new (string, Func<string, object?>)[] {
    ("CeveNombre", ParseTxt), ("SkuCodigo", ParseTxt), ("CantidadTotal", ParseNum),
    ("FechaCaptura", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? (object)v : ""; }),
});

List<ResultadoCarga> RecargarTodo() => new() {
    CargarCeves(), CargarProductosHub(), CargarCalendario(), CargarPlantasCedis(),
    CargarPedidoCevePlanta(), CargarPedidoOracle(), CargarExistenciaCeveManual(),
    CargarPedidoVsCargoReal(), CargarParticipacionTipoMovimiento(),
    CargarCatCadenaSupministro(), CargarRemisiones(),
    CargarPedidoVendedorPromedios(), CargarFrecuenciasConsolidadas(), CargarInventarioResumen(),
    CargarSeguimientoServicios(),
};

RecargarTodo();

// ── Fill Rate Planta/Cedis a CeVe ───────────────────────────────────────────
// Igual que en la app original: compara lo pedido (PedidosCevePlanta) contra
// lo embarcado (RemisionesProductosCEQ) por CeVe+Item+Fecha, y lo enriquece
// con catálogos para mostrar nombres y calcular Recorte/Aumento en envases,
// piezas e importe. A diferencia del original (una query SQL de Azure con
// varias etapas por timeouts de 230s), aquí no hace falta: se trae cada
// fuente a memoria una sola vez y se cruza con diccionarios, porque SQLite no
// tiene TRY_CONVERT/DATEFIRST/CROSS APPLY y los volúmenes de una app de un
// solo usuario no justifican pelear con eso en SQL.
const int FillRateCeveMin = 12000, FillRateCeveMax = 25769;

static string NormalizarCodigo(string? s)
{
    s = (s ?? "").Trim();
    if (s.Length == 0) return "";
    if (s.Any(c => !char.IsDigit(c))) return s.ToUpperInvariant();
    return long.TryParse(s, out var n) ? n.ToString() : s.ToUpperInvariant();
}

static decimal? ParseDecN(string? s) => string.IsNullOrWhiteSpace(s) ? null : (decimal.TryParse(s.Trim(), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var v) ? v : null);

object EjecutarFillRate(string fechaInicio, string fechaFin)
{
    var fi = NormalizarFechaIso(fechaInicio); if (fi.Length == 0) fi = fechaInicio.Trim();
    var ff = NormalizarFechaIso(fechaFin); if (ff.Length == 0) ff = fechaFin.Trim();

    using var conn = new SqliteConnection(connStr);
    conn.Open();

    var pedidos = new Dictionary<(string ceve, string item, string fecha), decimal>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Cantidad, FechaVenta FROM PedidosCevePlanta WHERE FechaVenta BETWEEN $fi AND $ff";
        cmd.Parameters.AddWithValue("$fi", fi); cmd.Parameters.AddWithValue("$ff", ff);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var cant = dr.IsDBNull(2) ? 0m : Convert.ToDecimal(dr.GetValue(2));
            var fecha = dr.IsDBNull(3) ? "" : dr.GetString(3);
            if (ceve.Length == 0 || fecha.Length == 0) continue;
            var key = (ceve, item, fecha);
            pedidos[key] = pedidos.GetValueOrDefault(key) + cant;
        }
    }

    var embarques = new Dictionary<(string ceve, string item, string fecha), decimal>();
    var catalogoRemisiones = new Dictionary<(string ceve, string item), (string origenId, string fecha)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT OrigenId, DestinoId, Producto, FechaVenta, FechaCierreEmbarque, CantidadEnviada FROM RemisionesProductosCEQ";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var origenId = dr.IsDBNull(0) ? "" : dr.GetString(0);
            var ceve = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var item = NormalizarCodigo(dr.IsDBNull(2) ? "" : dr.GetString(2));
            var fechaVenta = dr.IsDBNull(3) ? "" : dr.GetString(3);
            var fechaCierre = dr.IsDBNull(4) ? "" : dr.GetString(4);
            var cant = dr.IsDBNull(5) ? 0m : Convert.ToDecimal(dr.GetValue(5));
            if (ceve.Length == 0) continue;

            if (fechaVenta.Length > 0 && string.CompareOrdinal(fechaVenta, fi) >= 0 && string.CompareOrdinal(fechaVenta, ff) <= 0)
            {
                var key = (ceve, item, fechaVenta);
                embarques[key] = embarques.GetValueOrDefault(key) + cant;
            }
            if (fechaCierre.Length > 0)
            {
                var ckey = (ceve, item);
                if (!catalogoRemisiones.TryGetValue(ckey, out var cur) || string.CompareOrdinal(fechaCierre, cur.fecha) > 0)
                    catalogoRemisiones[ckey] = (origenId, fechaCierre);
            }
        }
    }

    var ceves = new Dictionary<string, (string nombre, string region, string org, string coord)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Nombre, Region, Organizacion, Coordinador FROM Ceves";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var c = NormalizarCodigo(dr.GetString(0));
            if (c.Length > 0) ceves[c] = (dr.IsDBNull(1) ? "" : dr.GetString(1), dr.IsDBNull(2) ? "" : dr.GetString(2), dr.IsDBNull(3) ? "" : dr.GetString(3), dr.IsDBNull(4) ? "" : dr.GetString(4));
        }
    }

    var calendario = new Dictionary<string, string>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT Fecha, Semana FROM CalendarioBimbo";
        using var dr = cmd.ExecuteReader();
        while (dr.Read()) calendario[dr.GetString(0)] = dr.IsDBNull(1) ? "" : dr.GetString(1);
    }

    var productos = new Dictionary<string, (string shortName, string longName, decimal? price, decimal? trayCap, string trayCode, decimal? daysLife, string brand, string category, decimal? beds)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT ItemCode, ShortName, LongName, Price, TrayCapacity, TrayCode, DaysLife, Brand, CategoryItem, BedsPerContainer FROM ProductosHub";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var item = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            if (item.Length == 0) continue;
            productos[item] = (
                dr.IsDBNull(1) ? "" : dr.GetString(1), dr.IsDBNull(2) ? "" : dr.GetString(2),
                dr.IsDBNull(3) ? null : ParseDecN(dr.GetString(3)), dr.IsDBNull(4) ? null : ParseDecN(dr.GetString(4)),
                dr.IsDBNull(5) ? "" : dr.GetString(5), dr.IsDBNull(6) ? null : ParseDecN(dr.GetString(6)),
                dr.IsDBNull(7) ? "" : dr.GetString(7), dr.IsDBNull(8) ? "" : dr.GetString(8),
                dr.IsDBNull(9) ? null : ParseDecN(dr.GetString(9)));
        }
    }

    var cadena = new Dictionary<(string ceve, string item), List<(string semana, string produce, string recoge, string distribuye, string linea)>>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Semana, Produce, Recoge, Distribuye, Linea FROM CatCadenaSupministro";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            if (ceve.Length == 0) continue;
            var key = (ceve, item);
            if (!cadena.TryGetValue(key, out var list)) cadena[key] = list = new();
            list.Add((dr.IsDBNull(2) ? "" : dr.GetString(2), dr.IsDBNull(3) ? "" : dr.GetString(3), dr.IsDBNull(4) ? "" : dr.GetString(4), dr.IsDBNull(5) ? "" : dr.GetString(5), dr.IsDBNull(6) ? "" : dr.GetString(6)));
        }
    }

    (string produce, string recoge, string distribuye, string linea) ResolverCadena(string ceve, string item, string semana)
    {
        if (!cadena.TryGetValue((ceve, item), out var list) || list.Count == 0) return ("", "", "", "");
        foreach (var c in list) if (c.semana == semana) return (c.produce, c.recoge, c.distribuye, c.linea);
        var best = list.OrderByDescending(c => int.TryParse(c.semana, out var sn) ? sn : int.MinValue).First();
        return (best.produce, best.recoge, best.distribuye, best.linea);
    }

    var plantasCedis = new Dictionary<string, string>();
    void AddPlanta(string code, string customerName)
    {
        if (code.Length == 0) return;
        if (!plantasCedis.TryGetValue(code, out var cur) || string.CompareOrdinal(customerName, cur) < 0) plantasCedis[code] = customerName;
    }
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT Planta, WH, CustomerName FROM CatPlantasCedis";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var cust = dr.IsDBNull(2) ? "" : dr.GetString(2);
            AddPlanta(NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0)), cust);
            AddPlanta(NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1)), cust);
        }
    }

    var claves = new HashSet<(string ceve, string item, string fecha)>(pedidos.Keys);
    claves.UnionWith(embarques.Keys);

    using var tx = conn.BeginTransaction();
    using (var del = conn.CreateCommand()) { del.Transaction = tx; del.CommandText = "DELETE FROM FillRateResultados"; del.ExecuteNonQuery(); }

    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    ins.CommandText = """
        INSERT INTO FillRateResultados (
            CodigoCeve,NombreCeve,Region,Organizacion,Coordinador,Item,ShortName,LongName,Price,TrayCapacity,TrayCode,
            DaysLife,Brand,CategoryItem,BedsPerContainer,Semana,FechaVenta,OrigenId,OrigenCusN,FechaCierreEmbarqueMax,
            Produce,ProduceCusN,Recoge,RecogeCusN,Distribuye,DistribuyeCusN,OrigenEmbarque,Linea,
            PedidoCeve,EmbarquePlantaCedis,DiferenciaEnv,RecorteEnv,AumentoEnv,EmbarqueSinAumentosEnv,
            PedidoCevePiezas,EmbarquePiezas,DiferenciaPiezas,RecortePiezas,AumentoPiezas,EmbarqueSinAumentosPiezas,
            PedidoCeveImporte,EmbarqueImporte,DiferenciaImporte,RecorteImporte,AumentoImporte,EmbarqueSinAumentosImporte
        ) VALUES (
            $p0,$p1,$p2,$p3,$p4,$p5,$p6,$p7,$p8,$p9,$p10,$p11,$p12,$p13,$p14,$p15,$p16,$p17,$p18,$p19,
            $p20,$p21,$p22,$p23,$p24,$p25,$p26,$p27,$p28,$p29,$p30,$p31,$p32,$p33,$p34,$p35,$p36,$p37,$p38,$p39,
            $p40,$p41,$p42,$p43,$p44,$p45
        )
        """;
    for (int c = 0; c < 46; c++) ins.Parameters.Add(new SqliteParameter("$p" + c, DBNull.Value));

    int filas = 0;
    foreach (var key in claves)
    {
        if (!int.TryParse(key.ceve, out var ceveNum) || ceveNum < FillRateCeveMin || ceveNum > FillRateCeveMax) continue;

        var pedido = pedidos.GetValueOrDefault(key);
        var embarque = embarques.GetValueOrDefault(key);
        ceves.TryGetValue(key.ceve, out var ceveInfo);
        calendario.TryGetValue(key.fecha, out var semana);
        productos.TryGetValue(key.item, out var prod);
        catalogoRemisiones.TryGetValue((key.ceve, key.item), out var cr);
        var (produce, recoge, distribuye, linea) = ResolverCadena(key.ceve, key.item, semana ?? "");

        string? origenCusN = cr.origenId != null && plantasCedis.TryGetValue(NormalizarCodigo(cr.origenId), out var ocn) ? ocn : null;
        string? produceCusN = plantasCedis.TryGetValue(NormalizarCodigo(produce), out var pcn) ? pcn : null;
        string? recogeCusN = plantasCedis.TryGetValue(NormalizarCodigo(recoge), out var rcn) ? rcn : null;
        string? distribuyeCusN = plantasCedis.TryGetValue(NormalizarCodigo(distribuye), out var dcn) ? dcn : null;
        string? origenEmbarque = origenCusN ?? distribuyeCusN;

        var diferenciaEnv = embarque - pedido;
        var recorteEnv = diferenciaEnv < 0 ? Math.Abs(diferenciaEnv) : 0;
        var aumentoEnv = diferenciaEnv > 0 ? diferenciaEnv : 0;
        var embarqueSinAumentosEnv = embarque - aumentoEnv;

        var trayCap = prod.trayCap;
        var price = prod.price;
        decimal? pedidoPiezas = trayCap.HasValue ? pedido * trayCap : null;
        decimal? embarquePiezas = trayCap.HasValue ? embarque * trayCap : null;
        decimal? diferenciaPiezas = trayCap.HasValue ? diferenciaEnv * trayCap : null;
        decimal? recortePiezas = trayCap.HasValue ? recorteEnv * trayCap : null;
        decimal? aumentoPiezas = trayCap.HasValue ? aumentoEnv * trayCap : null;
        decimal? embarqueSinAumentosPiezas = embarquePiezas - aumentoPiezas;

        decimal? pedidoImporte = pedidoPiezas * price;
        decimal? embarqueImporte = embarquePiezas * price;
        decimal? diferenciaImporte = diferenciaPiezas * price;
        decimal? recorteImporte = recortePiezas * price;
        decimal? aumentoImporte = aumentoPiezas * price;
        decimal? embarqueSinAumentosImporte = embarqueSinAumentosPiezas * price;

        object[] vals = {
            key.ceve, ceveInfo.nombre, ceveInfo.region, ceveInfo.org, ceveInfo.coord, key.item, prod.shortName, prod.longName,
            (object?)price ?? DBNull.Value, (object?)trayCap ?? DBNull.Value, prod.trayCode, (object?)prod.daysLife ?? DBNull.Value,
            prod.brand, prod.category, (object?)prod.beds ?? DBNull.Value, semana ?? "", key.fecha,
            cr.origenId ?? "", (object?)origenCusN ?? DBNull.Value, cr.fecha ?? "",
            produce, (object?)produceCusN ?? DBNull.Value, recoge, (object?)recogeCusN ?? DBNull.Value,
            distribuye, (object?)distribuyeCusN ?? DBNull.Value, (object?)origenEmbarque ?? DBNull.Value, linea,
            pedido, embarque, diferenciaEnv, recorteEnv, aumentoEnv, embarqueSinAumentosEnv,
            (object?)pedidoPiezas ?? DBNull.Value, (object?)embarquePiezas ?? DBNull.Value, (object?)diferenciaPiezas ?? DBNull.Value,
            (object?)recortePiezas ?? DBNull.Value, (object?)aumentoPiezas ?? DBNull.Value, (object?)embarqueSinAumentosPiezas ?? DBNull.Value,
            (object?)pedidoImporte ?? DBNull.Value, (object?)embarqueImporte ?? DBNull.Value, (object?)diferenciaImporte ?? DBNull.Value,
            (object?)recorteImporte ?? DBNull.Value, (object?)aumentoImporte ?? DBNull.Value, (object?)embarqueSinAumentosImporte ?? DBNull.Value,
        };
        for (int c = 0; c < vals.Length; c++) ins.Parameters[c].Value = vals[c] ?? DBNull.Value;
        ins.ExecuteNonQuery();
        filas++;
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO ProcesosLog (Proceso, Detalle, Filas, EjecutadoEn) VALUES ('Fill Rate', $d, $f, $c)";
        log.Parameters.AddWithValue("$d", $"{fi} a {ff}");
        log.Parameters.AddWithValue("$f", filas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }
    tx.Commit();

    return new { ok = true, filas, fechaInicio = fi, fechaFin = ff };
}

// ── Existencia Teórica ──────────────────────────────────────────────────────
// Para la Fecha_Venta seleccionada: calcula cuánto habrá en existencia cada
// uno de los próximos 6 días hábiles de tránsito (sin domingo), cruzando lo
// pedido (PedidoCevePlanta), la existencia física de hoy (InventarioResumen o
// ExistenciaCeveManual, según @BaseExistencia), y el promedio histórico de
// pedido + lead time (Promedios de Pedido / Frecuencias Producto CeVes) para
// calcular stock de seguridad e inventario óptimo. Igual que Fill Rate: se
// hace en memoria en C# porque SQLite no tiene DATEFIRST/CROSS APPLY.
string[] DiasSemanaEs = { "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado" };
string NombreDiaEs(DateTime d) => DiasSemanaEs[(int)d.DayOfWeek];
static int StartIdxDeDia(string dia) => dia switch
{
    "Lunes" => 0, "Martes" => 1, "Miércoles" => 2, "Jueves" => 3, "Viernes" => 4, "Sábado" => 5, _ => 0,
};

object EjecutarExistenciaTeorica(string fechaSelStr, string baseExistencia)
{
    var fsIso = NormalizarFechaIso(fechaSelStr); if (fsIso.Length == 0) fsIso = fechaSelStr.Trim();
    var fechaSel = DateTime.Parse(fsIso, System.Globalization.CultureInfo.InvariantCulture);
    var fechaProceso = fechaSel.AddDays(-7);
    var fpIso = fechaProceso.ToString("yyyy-MM-dd");
    var diaSemanaSel = NombreDiaEs(fechaSel);
    var startIdx = StartIdxDeDia(diaSemanaSel);

    using var conn = new SqliteConnection(connStr);
    conn.Open();

    // Universo CeVe+Item: quién pidió en los últimos 7 días, prefiriendo el
    // pedido de hoy mismo si existe.
    var catalogo = new Dictionary<(string ceve, string item), (string fecha, bool exacta)>();
    var pedidoFabrica = new Dictionary<(string ceve, string item, string fecha), decimal>();
    var pedidoDia = new Dictionary<(string ceve, string item), decimal>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Cantidad, FechaVenta FROM PedidosCevePlanta WHERE FechaVenta BETWEEN $fp AND $fs";
        cmd.Parameters.AddWithValue("$fp", fpIso); cmd.Parameters.AddWithValue("$fs", fsIso);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var cant = dr.IsDBNull(2) ? 0m : Convert.ToDecimal(dr.GetValue(2));
            var fecha = dr.IsDBNull(3) ? "" : dr.GetString(3);
            if (ceve.Length == 0 || fecha.Length == 0) continue;

            var key = (ceve, item);
            bool exacta = fecha == fsIso;
            if (!catalogo.TryGetValue(key, out var cur) || (exacta && !cur.exacta) || (exacta == cur.exacta && string.CompareOrdinal(fecha, cur.fecha) > 0))
                catalogo[key] = (fecha, exacta);

            var fkey = (ceve, item, fecha);
            pedidoFabrica[fkey] = pedidoFabrica.GetValueOrDefault(fkey) + cant;
            if (exacta) pedidoDia[key] = pedidoDia.GetValueOrDefault(key) + cant;
        }
    }

    // 6 próximos días hábiles de tránsito (sin domingo) entre FechaProceso y FechaSel.
    var diasTransito = new List<(DateTime fecha, string dia)>();
    for (int n = 1; n <= 8 && diasTransito.Count < 6; n++)
    {
        var f = fechaProceso.AddDays(n);
        if (f.DayOfWeek == DayOfWeek.Sunday || f > fechaSel) continue;
        diasTransito.Add((f, NombreDiaEs(f)));
    }

    var ceves = new Dictionary<string, (string nombre, string region, string org)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Nombre, Region, Organizacion FROM Ceves";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var c = NormalizarCodigo(dr.GetString(0));
            if (c.Length > 0) ceves[c] = (dr.IsDBNull(1) ? "" : dr.GetString(1), dr.IsDBNull(2) ? "" : dr.GetString(2), dr.IsDBNull(3) ? "" : dr.GetString(3));
        }
    }

    var productos = new Dictionary<string, (string shortName, string longName, decimal? price, decimal? trayCap, decimal? containerCap, decimal? daysLife, string brand, string category)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT ItemCode, ShortName, LongName, Price, TrayCapacity, ContainerCapacity, DaysLife, Brand, CategoryItem FROM ProductosHub";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var item = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            if (item.Length == 0) continue;
            productos[item] = (
                dr.IsDBNull(1) ? "" : dr.GetString(1), dr.IsDBNull(2) ? "" : dr.GetString(2),
                dr.IsDBNull(3) ? null : ParseDecN(dr.GetString(3)), dr.IsDBNull(4) ? null : ParseDecN(dr.GetString(4)),
                dr.IsDBNull(5) ? null : ParseDecN(dr.GetString(5)), dr.IsDBNull(6) ? null : ParseDecN(dr.GetString(6)),
                dr.IsDBNull(7) ? "" : dr.GetString(7), dr.IsDBNull(8) ? "" : dr.GetString(8));
        }
    }

    var pvp = new Dictionary<(string ceve, string item, string dia), (decimal promedio, decimal desviacion)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Dia, PromedioFinalPedido, DesviacionStdPedido FROM PedidoVendedorPromedios";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var dia = (dr.IsDBNull(2) ? "" : dr.GetString(2)).Trim();
            if (ceve.Length == 0 || dia.Length == 0) continue;
            pvp[(ceve, item, dia)] = (dr.IsDBNull(3) ? 0m : Convert.ToDecimal(dr.GetValue(3)), dr.IsDBNull(4) ? 0m : Convert.ToDecimal(dr.GetValue(4)));
        }
    }

    var frec = new Dictionary<(string ceve, string item, string dia), (int leadTime, string frecuenciaDias)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Dia, LeadTime, FrecuenciaDias FROM FrecuenciasConsolidadas";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var dia = (dr.IsDBNull(2) ? "" : dr.GetString(2)).Trim();
            if (ceve.Length == 0 || dia.Length == 0) continue;
            frec[(ceve, item, dia)] = (dr.IsDBNull(3) ? 0 : Convert.ToInt32(dr.GetValue(3)), dr.IsDBNull(4) ? "" : dr.GetString(4));
        }
    }

    // Existencia manual "automática" (InventarioResumen): ceve_nombre trae el
    // código de CeVe como prefijo antes de un guion, ej. "12858-Texmelucan".
    var existManualAuto = new Dictionary<(string ceve, string item), decimal>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CeveNombre, SkuCodigo, CantidadTotal FROM InventarioResumen WHERE FechaCaptura = $fp";
        cmd.Parameters.AddWithValue("$fp", fpIso);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceveNombre = dr.IsDBNull(0) ? "" : dr.GetString(0);
            var guion = ceveNombre.IndexOf('-');
            var ceve = NormalizarCodigo(guion > 0 ? ceveNombre[..guion] : ceveNombre);
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            if (ceve.Length == 0) continue;
            existManualAuto[(ceve, item)] = dr.IsDBNull(2) ? 0m : Convert.ToDecimal(dr.GetValue(2));
        }
    }

    var existManualUsuario = new Dictionary<(string ceve, string item), decimal>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Cantidad FROM ExistenciaCeveManual WHERE FechaVenta = $fp";
        cmd.Parameters.AddWithValue("$fp", fpIso);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            if (ceve.Length == 0) continue;
            existManualUsuario[(ceve, item)] = dr.IsDBNull(2) ? 0m : Convert.ToDecimal(dr.GetValue(2));
        }
    }

    using var tx = conn.BeginTransaction();
    using (var del = conn.CreateCommand()) { del.Transaction = tx; del.CommandText = "DELETE FROM ExistenciaTeoricaResultados WHERE Fecha_Venta = $fs"; del.Parameters.AddWithValue("$fs", fsIso); del.ExecuteNonQuery(); }

    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    ins.CommandText = """
        INSERT INTO ExistenciaTeoricaResultados (
            Cod_ceve,Nombre_Indicadores_Almacenes_CeVe,Region,Organizacion,Item,ShortName,LongName,Price,
            TrayCapacity,ContainerCapacity,DaysLife,Brand,CategoryItem,Fecha_Venta,Fecha_Proceso,Dia_Semana,
            LeadTime,FrecuenciaDias,Fecha_Venta_Origen,Cantidad,Existencia_manual_pzs,Existencia_manual_env,
            Fecha_Transito1,Pedido_Fabrica1,CargoPromedio_Transito1,Existencia_teorica_1,
            Fecha_Transito2,Pedido_Fabrica2,CargoPromedio_Transito2,Existencia_teorica_2,
            Fecha_Transito3,Pedido_Fabrica3,CargoPromedio_Transito3,Existencia_teorica_3,
            Fecha_Transito4,Pedido_Fabrica4,CargoPromedio_Transito4,Existencia_teorica_4,
            Fecha_Transito5,Pedido_Fabrica5,CargoPromedio_Transito5,Existencia_teorica_5,
            Fecha_Transito6,Pedido_Fabrica6,CargoPromedio_Transito6,Existencia_teorica_6,
            PromedioFinalPedido,DesviacionStdPedido,Estadistico,Stock_Seguridad,
            Inventario_Optimo,Reposicion,Diferencia_Pedido_Fabrica
        ) VALUES (
            $p0,$p1,$p2,$p3,$p4,$p5,$p6,$p7,$p8,$p9,$p10,$p11,$p12,$p13,$p14,$p15,$p16,$p17,$p18,$p19,
            $p20,$p21,$p22,$p23,$p24,$p25,$p26,$p27,$p28,$p29,$p30,$p31,$p32,$p33,$p34,$p35,$p36,$p37,$p38,$p39,
            $p40,$p41,$p42,$p43,$p44,$p45,$p46,$p47,$p48,$p49,$p50,$p51,$p52
        )
        """;
    for (int c = 0; c < 53; c++) ins.Parameters.Add(new SqliteParameter("$p" + c, DBNull.Value));

    var diasLunSab = new[] { "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado" };
    int filas = 0;
    foreach (var (key, info) in catalogo)
    {
        var (ceve, item) = key;
        ceves.TryGetValue(ceve, out var ceveInfo);
        productos.TryGetValue(item, out var prod);
        var cantidad = pedidoDia.GetValueOrDefault(key, 0m);

        bool esManual = string.Equals(baseExistencia, "Man", StringComparison.OrdinalIgnoreCase);
        decimal? existManualPzs = esManual
            ? (existManualUsuario.TryGetValue(key, out var emu) ? emu : null)
            : (existManualAuto.TryGetValue(key, out var ema) ? ema : null);
        var trayCap = prod.trayCap;
        decimal? existManualEnv = (trayCap.HasValue && trayCap.Value != 0) ? Math.Floor((existManualPzs ?? 0) / trayCap.Value) : null;

        bool tieneFrec = frec.TryGetValue((ceve, item, diaSemanaSel), out var frRow);
        int leadTimeEf = tieneFrec ? frRow.leadTime : 0;

        var fechaTransitoN = new string?[6];
        var pedidoFabricaN = new decimal?[6];
        var cargoPromN = new decimal?[6];
        for (int i = 0; i < diasTransito.Count; i++)
        {
            var (fecha, dia) = diasTransito[i];
            fechaTransitoN[i] = fecha.ToString("yyyy-MM-dd");
            pedidoFabricaN[i] = pedidoFabrica.TryGetValue((ceve, item, fechaTransitoN[i]!), out var pf) ? pf : 0m;
            cargoPromN[i] = pvp.TryGetValue((ceve, item, dia), out var cp) ? cp.promedio : (decimal?)null;
        }

        bool tienePvSel = pvp.TryGetValue((ceve, item, diaSemanaSel), out var pvSel);
        decimal? promedioFinalPedido = tienePvSel ? Math.Ceiling(pvSel.promedio) : null;
        decimal? desviacionStdPedido = tienePvSel ? Math.Ceiling(pvSel.desviacion) : null;

        decimal estadistico = 0;
        for (int d = 0; d < 6; d++)
        {
            int offset = ((d - startIdx + 6) % 6);
            if (offset < leadTimeEf && pvp.TryGetValue((ceve, item, diasLunSab[d]), out var pvD))
                estadistico += pvD.promedio;
        }
        estadistico = Math.Ceiling(estadistico);

        decimal? stockSeguridad = desviacionStdPedido.HasValue ? desviacionStdPedido.Value * leadTimeEf : null;
        decimal? inventarioOptimo = stockSeguridad.HasValue ? Math.Ceiling(estadistico + stockSeguridad.Value) : null;

        var existenciaTeoricaN = new decimal?[6];
        for (int i = 0; i < 6; i++)
        {
            if (i >= diasTransito.Count) { existenciaTeoricaN[i] = null; continue; }
            var baseVal = i == 0 ? (existManualEnv ?? 0) : ((existenciaTeoricaN[i - 1].HasValue && existenciaTeoricaN[i - 1]!.Value >= 0) ? existenciaTeoricaN[i - 1]!.Value : 0);
            existenciaTeoricaN[i] = baseVal + (pedidoFabricaN[i] ?? 0) - (cargoPromN[i] ?? 0);
        }

        decimal? reposicion = inventarioOptimo.HasValue
            ? ((inventarioOptimo.Value - (existenciaTeoricaN[4] ?? 0)) < 0 ? 0 : Math.Ceiling(inventarioOptimo.Value - (existenciaTeoricaN[4] ?? 0)))
            : null;
        decimal? diferenciaPedidoFabrica = reposicion.HasValue ? Math.Ceiling((pedidoFabricaN[5] ?? 0) - reposicion.Value) : null;

        object[] vals = {
            ceve, ceveInfo.nombre, ceveInfo.region, ceveInfo.org, item, prod.shortName, prod.longName,
            (object?)prod.price ?? DBNull.Value, (object?)prod.trayCap ?? DBNull.Value, (object?)prod.containerCap ?? DBNull.Value,
            (object?)prod.daysLife ?? DBNull.Value, prod.brand, prod.category, fsIso, fpIso, diaSemanaSel,
            tieneFrec ? frRow.leadTime : (object)DBNull.Value, tieneFrec ? frRow.frecuenciaDias : "", info.fecha,
            cantidad, (object?)existManualPzs ?? DBNull.Value, (object?)existManualEnv ?? DBNull.Value,
            (object?)fechaTransitoN[0] ?? DBNull.Value, (object?)pedidoFabricaN[0] ?? DBNull.Value, (object?)cargoPromN[0] ?? DBNull.Value, (object?)existenciaTeoricaN[0] ?? DBNull.Value,
            (object?)fechaTransitoN[1] ?? DBNull.Value, (object?)pedidoFabricaN[1] ?? DBNull.Value, (object?)cargoPromN[1] ?? DBNull.Value, (object?)existenciaTeoricaN[1] ?? DBNull.Value,
            (object?)fechaTransitoN[2] ?? DBNull.Value, (object?)pedidoFabricaN[2] ?? DBNull.Value, (object?)cargoPromN[2] ?? DBNull.Value, (object?)existenciaTeoricaN[2] ?? DBNull.Value,
            (object?)fechaTransitoN[3] ?? DBNull.Value, (object?)pedidoFabricaN[3] ?? DBNull.Value, (object?)cargoPromN[3] ?? DBNull.Value, (object?)existenciaTeoricaN[3] ?? DBNull.Value,
            (object?)fechaTransitoN[4] ?? DBNull.Value, (object?)pedidoFabricaN[4] ?? DBNull.Value, (object?)cargoPromN[4] ?? DBNull.Value, (object?)existenciaTeoricaN[4] ?? DBNull.Value,
            (object?)fechaTransitoN[5] ?? DBNull.Value, (object?)pedidoFabricaN[5] ?? DBNull.Value, (object?)cargoPromN[5] ?? DBNull.Value, (object?)existenciaTeoricaN[5] ?? DBNull.Value,
            (object?)promedioFinalPedido ?? DBNull.Value, (object?)desviacionStdPedido ?? DBNull.Value, estadistico, (object?)stockSeguridad ?? DBNull.Value,
            (object?)inventarioOptimo ?? DBNull.Value, (object?)reposicion ?? DBNull.Value, (object?)diferenciaPedidoFabrica ?? DBNull.Value,
        };
        for (int c = 0; c < vals.Length; c++) ins.Parameters[c].Value = vals[c] ?? DBNull.Value;
        ins.ExecuteNonQuery();
        filas++;
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO ExistenciaTeoricaEjecuciones (FechaSel, BaseExistencia, Filas, EjecutadoEn) VALUES ($fs,$b,$f,$c)";
        log.Parameters.AddWithValue("$fs", fsIso);
        log.Parameters.AddWithValue("$b", baseExistencia);
        log.Parameters.AddWithValue("$f", filas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }
    tx.Commit();

    return new { ok = true, filas, fechaSel = fsIso, fechaProceso = fpIso };
}

// ── Post-Mortem ──────────────────────────────────────────────────────────
// Compara lo que Existencia Teórica predijo (ya guardado) contra lo que
// realmente pasó: embarque real (FillRateResultados) y cargo/pedido real
// (PedidoVsCargoReal, con manejo de "espejo": un Item que empieza con 99 es
// un cargo/pedido compensatorio del mismo item sin el prefijo). Necesita que
// Existencia Teórica ya se haya ejecutado para esa Fecha_Venta.
object EjecutarPostMortem(string fechaVentaStr)
{
    var fvIso = NormalizarFechaIso(fechaVentaStr); if (fvIso.Length == 0) fvIso = fechaVentaStr.Trim();

    using var conn = new SqliteConnection(connStr);
    conn.Open();

    long teoricaCount;
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT COUNT(*) FROM ExistenciaTeoricaEjecuciones WHERE FechaSel = $f";
        cmd.Parameters.AddWithValue("$f", fvIso);
        teoricaCount = Convert.ToInt64(cmd.ExecuteScalar());
    }
    if (teoricaCount == 0)
        throw new InvalidOperationException($"No hay una ejecución de Existencia Teórica para la fecha {fvIso}. Ejecuta Existencia Teórica primero para esa fecha.");

    var teorico = new List<Dictionary<string, object?>>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT * FROM ExistenciaTeoricaResultados WHERE Fecha_Venta = $f";
        cmd.Parameters.AddWithValue("$f", fvIso);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var row = new Dictionary<string, object?>();
            for (int i = 0; i < dr.FieldCount; i++) row[dr.GetName(i)] = dr.IsDBNull(i) ? null : dr.GetValue(i);
            teorico.Add(row);
        }
    }

    string fpIso = teorico.Count > 0 && teorico[0]["Fecha_Proceso"] is string fp0 ? fp0
        : DateTime.Parse(fvIso, System.Globalization.CultureInfo.InvariantCulture).AddDays(-7).ToString("yyyy-MM-dd");

    var fr = new Dictionary<(string ceve, string item, string fecha), (decimal embarque, decimal diferencia, decimal recorte, decimal aumento, decimal sinAumentos)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodigoCeve, Item, FechaVenta, EmbarquePlantaCedis, DiferenciaEnv, RecorteEnv, AumentoEnv, EmbarqueSinAumentosEnv FROM FillRateResultados WHERE FechaVenta BETWEEN $fp AND $fv";
        cmd.Parameters.AddWithValue("$fp", fpIso); cmd.Parameters.AddWithValue("$fv", fvIso);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var fecha = dr.IsDBNull(2) ? "" : dr.GetString(2);
            if (ceve.Length == 0) continue;
            fr[(ceve, item, fecha)] = (
                dr.IsDBNull(3) ? 0m : Convert.ToDecimal(dr.GetValue(3)), dr.IsDBNull(4) ? 0m : Convert.ToDecimal(dr.GetValue(4)),
                dr.IsDBNull(5) ? 0m : Convert.ToDecimal(dr.GetValue(5)), dr.IsDBNull(6) ? 0m : Convert.ToDecimal(dr.GetValue(6)),
                dr.IsDBNull(7) ? 0m : Convert.ToDecimal(dr.GetValue(7)));
        }
    }

    var pvcr = new Dictionary<(string ceve, string item, string fecha), (decimal cargoPzs, decimal cargoEspejoPzs, decimal pedidoPzs, decimal pedidoEspejoPzs)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, FechaVenta, CargoPzs, PedidoPzs FROM PedidoVsCargoReal WHERE FechaVenta BETWEEN $fp AND $fv";
        cmd.Parameters.AddWithValue("$fp", fpIso); cmd.Parameters.AddWithValue("$fv", fvIso);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var itemRaw = (dr.IsDBNull(1) ? "" : dr.GetString(1)).Trim();
            var fecha = dr.IsDBNull(2) ? "" : dr.GetString(2);
            var cargo = dr.IsDBNull(3) ? 0m : Convert.ToDecimal(dr.GetValue(3));
            var pedido = dr.IsDBNull(4) ? 0m : Convert.ToDecimal(dr.GetValue(4));
            if (ceve.Length == 0 || itemRaw.Length == 0) continue;
            bool esEspejo = itemRaw.StartsWith("99");
            var itemOriginal = NormalizarCodigo(esEspejo ? itemRaw[2..] : itemRaw);
            var key = (ceve, itemOriginal, fecha);
            pvcr.TryGetValue(key, out var cur);
            pvcr[key] = esEspejo ? (cur.cargoPzs, cargo, cur.pedidoPzs, pedido) : (cargo, cur.cargoEspejoPzs, pedido, cur.pedidoEspejoPzs);
        }
    }

    var cols = ColumnasPostMortem();

    using var tx = conn.BeginTransaction();
    using (var del = conn.CreateCommand()) { del.Transaction = tx; del.CommandText = "DELETE FROM PostMortemResultados WHERE Fecha_Venta = $f"; del.Parameters.AddWithValue("$f", fvIso); del.ExecuteNonQuery(); }

    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    var paramNames = cols.Select((c, i) => "$p" + i).ToArray();
    ins.CommandText = $"INSERT INTO PostMortemResultados ({string.Join(",", cols.Select(c => $"[{c}]"))}) VALUES ({string.Join(",", paramNames)})";
    foreach (var pn in paramNames) ins.Parameters.Add(new SqliteParameter(pn, DBNull.Value));

    int filas = 0;
    foreach (var t in teorico)
    {
        var ceve = NormalizarCodigo(t["Cod_ceve"]?.ToString() ?? "");
        var item = NormalizarCodigo(t["Item"]?.ToString() ?? "");
        decimal? trayCap = t["TrayCapacity"] is null ? null : Convert.ToDecimal(t["TrayCapacity"]);
        decimal existManualEnv = t["Existencia_manual_env"] is null ? 0 : Convert.ToDecimal(t["Existencia_manual_env"]);

        var row = new Dictionary<string, object?> {
            ["Cod_ceve"] = ceve, ["Nombre_Indicadores_Almacenes_CeVe"] = t["Nombre_Indicadores_Almacenes_CeVe"],
            ["Region"] = t["Region"], ["Organizacion"] = t["Organizacion"], ["Item"] = item, ["ShortName"] = t["ShortName"],
            ["Fecha_Venta"] = t["Fecha_Venta"], ["Fecha_Proceso"] = t["Fecha_Proceso"], ["Dia_Semana"] = t["Dia_Semana"],
            ["Existencia_manual_env"] = existManualEnv, ["Inventario_Optimo"] = t["Inventario_Optimo"] is null ? 0 : Convert.ToDecimal(t["Inventario_Optimo"]),
        };

        decimal existenciaRealPrev = existManualEnv;
        for (int n = 1; n <= 6; n++)
        {
            var fechaTransito = t[$"Fecha_Transito{n}"] as string;
            decimal pedidoFabrica = t[$"Pedido_Fabrica{n}"] is null ? 0 : Convert.ToDecimal(t[$"Pedido_Fabrica{n}"]);
            decimal cargoProm = t[$"CargoPromedio_Transito{n}"] is null ? 0 : Convert.ToDecimal(t[$"CargoPromedio_Transito{n}"]);
            decimal existenciaTeorica = t[$"Existencia_teorica_{n}"] is null ? 0 : Convert.ToDecimal(t[$"Existencia_teorica_{n}"]);

            decimal embarqueReal = 0, diferenciaEnv = 0, recorteEnv = 0, aumentoEnv = 0, embarqueSinAumentosEnv = 0;
            if (fechaTransito != null && fr.TryGetValue((ceve, item, fechaTransito), out var frRow))
                (embarqueReal, diferenciaEnv, recorteEnv, aumentoEnv, embarqueSinAumentosEnv) = frRow;

            decimal cargoPzsEnv = 0, cargoEspejoPzsEnv = 0, pedidoPzsEnv = 0, pedidoEspejoPzsEnv = 0;
            if (fechaTransito != null && trayCap.HasValue && trayCap.Value != 0 && pvcr.TryGetValue((ceve, item, fechaTransito), out var pvRow))
            {
                cargoPzsEnv = Math.Floor(pvRow.cargoPzs / trayCap.Value);
                cargoEspejoPzsEnv = Math.Floor(pvRow.cargoEspejoPzs / trayCap.Value);
                pedidoPzsEnv = Math.Floor(pvRow.pedidoPzs / trayCap.Value);
                pedidoEspejoPzsEnv = Math.Floor(pvRow.pedidoEspejoPzs / trayCap.Value);
            }
            decimal cargoTotal = cargoPzsEnv + cargoEspejoPzsEnv;
            decimal pedidoTotal = pedidoPzsEnv + pedidoEspejoPzsEnv;

            decimal xReal = existenciaRealPrev + embarqueReal - cargoTotal;
            decimal existenciaReal = xReal < 0 ? 0 : xReal;
            existenciaRealPrev = existenciaReal;

            row[$"Fecha_Transito{n}"] = fechaTransito;
            row[$"Pedido_Fabrica{n}"] = pedidoFabrica;
            row[$"CargoPromedio_Transito{n}"] = cargoProm;
            row[$"Existencia_teorica_{n}"] = existenciaTeorica;
            row[$"Embarque_Real{n}"] = embarqueReal;
            row[$"Diferencia_env{n}"] = diferenciaEnv;
            row[$"Recorte_env{n}"] = recorteEnv;
            row[$"Aumento_env{n}"] = aumentoEnv;
            row[$"Embarque_Sin_Aumentos_env{n}"] = embarqueSinAumentosEnv;
            row[$"Cargo_pzs{n}"] = cargoPzsEnv;
            row[$"Cargo_espejo_pzs{n}"] = cargoEspejoPzsEnv;
            row[$"Cargo_total{n}"] = cargoTotal;
            row[$"Pedido_pzs{n}"] = pedidoPzsEnv;
            row[$"Pedido_espejo_pzs{n}"] = pedidoEspejoPzsEnv;
            row[$"Pedido_total{n}"] = pedidoTotal;
            row[$"Existencia_Real{n}"] = existenciaReal;
            row[$"Diferencia_Embarque{n}"] = embarqueReal - pedidoFabrica;
            row[$"Diferencia_Carga{n}"] = cargoTotal - cargoProm;
            row[$"Diferencia_Existencia{n}"] = existenciaReal - existenciaTeorica;
        }

        for (int c = 0; c < cols.Count; c++) ins.Parameters[c].Value = row.TryGetValue(cols[c], out var v) ? (v ?? DBNull.Value) : DBNull.Value;
        ins.ExecuteNonQuery();
        filas++;
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO PostMortemEjecuciones (FechaVenta, Filas, EjecutadoEn) VALUES ($f,$n,$c)";
        log.Parameters.AddWithValue("$f", fvIso);
        log.Parameters.AddWithValue("$n", filas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }
    tx.Commit();

    return new { ok = true, filas, fechaVenta = fvIso, fechaProceso = fpIso };
}

// ── Causas Recorte ───────────────────────────────────────────────────────
// A diferencia de los demás procesos (parametrizados por fecha), este parte
// de un CSV con el detalle de recorte por CeVe+Item+Fecha+Canal (se deposita
// en Datos/Procesos/CausasRecorte/, igual convención que todo lo demás).
// Agrupa todo menos el canal para diagnosticar la causa cruzando contra
// Post-Mortem, Fill Rate, Promedios de Pedido e Inventario Resumen, y guarda
// el resultado a nivel canal (replicando la causa calculada a nivel
// CeVe+Item+Fecha en cada fila, para poder filtrar por canal en pantalla).
object EjecutarCausasRecorte()
{
    var carpeta = Path.Combine(datosDir, "Procesos/CausasRecorte");
    var archivo = UltimoArchivoCsv(carpeta);
    if (archivo is null) throw new InvalidOperationException("Sin archivo CSV en Datos/Procesos/CausasRecorte. Deposita el extracto antes de ejecutar.");

    var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
    if (lines.Length < 2) throw new InvalidOperationException($"'{Path.GetFileName(archivo)}' está vacío.");

    var filas = new List<CrFila>();
    string? fechaMin = null, fechaMax = null;
    for (int i = 1; i < lines.Length; i++)
    {
        var f = SplitCsvLine(lines[i]);
        if (f.Length < 21) continue;
        var fecha = NormalizarFechaIso(f[3]);
        if (fecha.Length == 0) continue;
        if (fechaMin is null || string.CompareOrdinal(fecha, fechaMin) < 0) fechaMin = fecha;
        if (fechaMax is null || string.CompareOrdinal(fecha, fechaMax) > 0) fechaMax = fecha;
        filas.Add(new CrFila(
            NormalizarCodigo(f[0]), f[1].Trim(), f[2].Trim(), fecha, f[4].Trim(),
            int.TryParse(f[5].Trim(), out var sem) ? sem : null,
            NormalizarCodigo(f[6]), f[7].Trim(), f[8].Trim(), f[9].Trim(), f[10].Trim(),
            ParseDecN(f[11]), ParseDecN(f[12]), ParseDecN(f[13]), ParseDecN(f[14]), ParseDecN(f[15]),
            ParseDecN(f[16]), ParseDecN(f[17]), ParseDecN(f[18]), ParseDecN(f[19]), ParseDecN(f[20])));
    }
    if (filas.Count == 0 || fechaMin is null || fechaMax is null)
        throw new InvalidOperationException("El archivo no tiene filas válidas.");

    var fechaMaxMas7 = DateTime.Parse(fechaMax, System.Globalization.CultureInfo.InvariantCulture).AddDays(7).ToString("yyyy-MM-dd");

    using var conn = new SqliteConnection(connStr);
    conn.Open();

    var pm = new Dictionary<(string ceve, string item, string fecha), PmRow>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = """
            SELECT Cod_ceve, Item, Fecha_Venta, Inventario_Optimo,
                   Fecha_Transito1,Fecha_Transito2,Fecha_Transito3,Fecha_Transito4,Fecha_Transito5,Fecha_Transito6,
                   Pedido_Fabrica1,Pedido_Fabrica2,Pedido_Fabrica3,Pedido_Fabrica4,Pedido_Fabrica5,Pedido_Fabrica6,
                   Embarque_Real1,Embarque_Real2,Embarque_Real3,Embarque_Real4,Embarque_Real5,Embarque_Real6,
                   Cargo_total1,Cargo_total2,Cargo_total3,Cargo_total4,Cargo_total5,Cargo_total6,
                   CargoPromedio_Transito1,CargoPromedio_Transito2,CargoPromedio_Transito3,CargoPromedio_Transito4,CargoPromedio_Transito5,CargoPromedio_Transito6
            FROM PostMortemResultados WHERE Fecha_Venta BETWEEN $fi AND $ff
            """;
        cmd.Parameters.AddWithValue("$fi", fechaMin); cmd.Parameters.AddWithValue("$ff", fechaMax);
        using var dr = cmd.ExecuteReader();
        decimal D(object v) => v is DBNull ? 0 : Convert.ToDecimal(v);
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var fecha = dr.IsDBNull(2) ? "" : dr.GetString(2);
            if (ceve.Length == 0) continue;
            var row = new PmRow { InventarioOptimo = D(dr.GetValue(3)) };
            for (int n = 0; n < 6; n++)
            {
                row.FechaTransito[n] = dr.IsDBNull(4 + n) ? null : dr.GetString(4 + n);
                row.PedidoFabrica[n] = D(dr.GetValue(10 + n));
                row.EmbarqueReal[n] = D(dr.GetValue(16 + n));
                row.CargoReal[n] = D(dr.GetValue(22 + n));
                row.CargoPromedio[n] = D(dr.GetValue(28 + n));
            }
            pm[(ceve, item, fecha)] = row;
        }
    }

    var fr = new Dictionary<(string ceve, string item, string fecha), (decimal recorteEnv, decimal pedidoCeve, decimal embarque, string origen)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodigoCeve, Item, FechaVenta, RecorteEnv, PedidoCeve, EmbarquePlantaCedis, OrigenEmbarque FROM FillRateResultados WHERE FechaVenta BETWEEN $fi AND $ff";
        cmd.Parameters.AddWithValue("$fi", fechaMin); cmd.Parameters.AddWithValue("$ff", fechaMax);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var fecha = dr.IsDBNull(2) ? "" : dr.GetString(2);
            if (ceve.Length == 0) continue;
            fr[(ceve, item, fecha)] = (
                dr.IsDBNull(3) ? 0 : Convert.ToDecimal(dr.GetValue(3)), dr.IsDBNull(4) ? 0 : Convert.ToDecimal(dr.GetValue(4)),
                dr.IsDBNull(5) ? 0 : Convert.ToDecimal(dr.GetValue(5)), dr.IsDBNull(6) ? "Planta" : dr.GetString(6));
        }
    }

    var pedidoFuturo = new Dictionary<(string ceve, string item), List<(string fecha, decimal cantidad)>>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, FechaVenta, Cantidad FROM PedidosCevePlanta WHERE FechaVenta BETWEEN $fi AND $ff2";
        cmd.Parameters.AddWithValue("$fi", fechaMin); cmd.Parameters.AddWithValue("$ff2", fechaMaxMas7);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var fecha = dr.IsDBNull(2) ? "" : dr.GetString(2);
            var cant = dr.IsDBNull(3) ? 0 : Convert.ToDecimal(dr.GetValue(3));
            if (ceve.Length == 0 || fecha.Length == 0) continue;
            var key = (ceve, item);
            if (!pedidoFuturo.TryGetValue(key, out var list)) pedidoFuturo[key] = list = new();
            list.Add((fecha, cant));
        }
    }

    var pvp = new Dictionary<(string ceve, string item, string dia), (decimal promPedido, decimal promCarga)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Dia, PromedioFinalPedido, PromedioFinalCarga FROM PedidoVendedorPromedios";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var dia = (dr.IsDBNull(2) ? "" : dr.GetString(2)).Trim();
            if (ceve.Length == 0 || dia.Length == 0) continue;
            pvp[(ceve, item, dia)] = (dr.IsDBNull(3) ? 0 : Convert.ToDecimal(dr.GetValue(3)), dr.IsDBNull(4) ? 0 : Convert.ToDecimal(dr.GetValue(4)));
        }
    }

    var inv = new Dictionary<(string ceve, string item, string fecha), decimal>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CeveNombre, SkuCodigo, CantidadTotal, FechaCaptura FROM InventarioResumen WHERE FechaCaptura BETWEEN $fi AND $ff";
        cmd.Parameters.AddWithValue("$fi", fechaMin); cmd.Parameters.AddWithValue("$ff", fechaMax);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceveNombre = dr.IsDBNull(0) ? "" : dr.GetString(0);
            var guion = ceveNombre.IndexOf('-');
            if (guion <= 0) continue;
            var ceve = NormalizarCodigo(ceveNombre[..guion]);
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var fecha = dr.IsDBNull(3) ? "" : dr.GetString(3);
            var cant = dr.IsDBNull(2) ? 0 : Convert.ToDecimal(dr.GetValue(2));
            if (ceve.Length == 0) continue;
            var key = (ceve, item, fecha);
            inv[key] = inv.GetValueOrDefault(key) + cant;
        }
    }

    // Agrupa todo menos el canal (una causa por CeVe+Item+Fecha).
    var grupos = filas.GroupBy(r => (r.Ceve, r.Item, r.Fecha)).ToDictionary(g => g.Key, g => new
    {
        NombreDia = g.Select(r => r.NombreDia).FirstOrDefault(n => !string.IsNullOrEmpty(n)) ?? "",
        Cupo = g.Max(r => r.Cupo),
        Precio = g.Max(r => r.Precio),
        PedidoPzsAgg = g.Sum(r => r.PedidoPzs ?? 0),
        RecortePzsAgg = g.Sum(r => r.RecortePzs ?? 0),
    });

    var diagnosticos = new Dictionary<(string, string, string), (string causaPrincipal, string? causaSecundaria, string resumen, decimal envsPlanta, decimal envsConsumo, decimal existenciaPzs, decimal cargoPromDiaPzs)>();
    foreach (var (key, g) in grupos)
    {
        var (ceve, item, fecha) = key;
        bool tienePm = pm.TryGetValue(key, out var pmRow);
        fr.TryGetValue(key, out var frRow);
        decimal recorteEnvHoy = frRow.recorteEnv;
        decimal cupo = g.Cupo ?? 0;
        decimal recortePzsAgg = g.RecortePzsAgg;
        decimal pedidoPzsAgg = g.PedidoPzsAgg;

        inv.TryGetValue(key, out var existenciaPzs);

        pvp.TryGetValue((ceve, item, g.NombreDia), out var pvpRow);
        decimal cargoPromDiaEnv = Math.Max(pvpRow.promPedido, pvpRow.promCarga);
        decimal cargoPromDiaPzs = cargoPromDiaEnv * cupo;

        decimal envsPlanta = 0;
        decimal envsConsumo = 0;
        if (tienePm)
        {
            for (int n = 0; n < 6; n++)
            {
                var diferenciaEmbarque = pmRow!.EmbarqueReal[n] - pmRow.PedidoFabrica[n];
                if (diferenciaEmbarque < 0) envsPlanta += -diferenciaEmbarque;
                var diferenciaCarga = pmRow.CargoReal[n] - pmRow.CargoPromedio[n];
                if (diferenciaCarga > 0) envsConsumo += diferenciaCarga;
            }
        }
        envsPlanta += recorteEnvHoy;
        if (recorteEnvHoy > 0 && pedidoPzsAgg > cargoPromDiaPzs && cupo != 0)
            envsConsumo += (pedidoPzsAgg - cargoPromDiaPzs) / cupo;

        // Pedido ya fincado para los próximos 7 días naturales (para distinguir
        // "sin pedido" real de "el pedido ya existe, está en tránsito").
        decimal pedidoFuturoCant = 0;
        var pedidoFuturoFechas = "";
        if (pedidoFuturo.TryGetValue((ceve, item), out var futList))
        {
            var fechaDt = DateTime.Parse(fecha, System.Globalization.CultureInfo.InvariantCulture);
            var porFecha = futList.Where(x => string.CompareOrdinal(x.fecha, fecha) > 0 && string.CompareOrdinal(x.fecha, fechaDt.AddDays(7).ToString("yyyy-MM-dd")) <= 0)
                .GroupBy(x => x.fecha).Select(gf => (fecha: gf.Key, cantidad: gf.Sum(x => x.cantidad))).Where(x => x.cantidad > 0).OrderBy(x => x.fecha).ToList();
            pedidoFuturoCant = porFecha.Sum(x => x.cantidad);
            pedidoFuturoFechas = string.Join(", ", porFecha.Select(x => DateTime.Parse(x.fecha, System.Globalization.CultureInfo.InvariantCulture).ToString("dd-MM")));
        }

        string causaPrincipal =
            envsPlanta > 0 ? "Recorte Fabrica" :
            (recortePzsAgg > 0 && cupo > 0 && recortePzsAgg < cupo) ? "Recorte por cupo en Tina" :
            envsConsumo > 0 ? "Consumo arriba del promedio" :
            (existenciaPzs > 0 && existenciaPzs >= 0.80m * recortePzsAgg) ? "Existencia CeVe" :
            !tienePm ? (pedidoFuturoCant > 0 ? "Sin Pedido CeVe Últimos 7 días - Pedido en tránsito" : "Sin Pedido CeVe Últimos 7 días") :
            "Sin causa identificada";

        string? causaSecundaria = !tienePm ? null : (envsPlanta > 0 && envsConsumo > 0 ? "Consumo arriba del promedio" : null);

        decimal totalPedidoFabrica = 0, totalEmbarqueReal = 0;
        if (tienePm) for (int n = 0; n < 6; n++) { totalPedidoFabrica += pmRow!.PedidoFabrica[n]; totalEmbarqueReal += pmRow.EmbarqueReal[n]; }
        decimal? pctCumplimiento = totalPedidoFabrica > 0 ? Math.Min(100m, 100m * totalEmbarqueReal / totalPedidoFabrica) : null;

        string resumen;
        if (envsPlanta > 0)
            resumen = $"Recorte Fabrica: {frRow.origen ?? "Planta"} - \"{fecha}\" - {(int)envsPlanta} Env" + (pctCumplimiento.HasValue ? $" ({(int)pctCumplimiento.Value}% cumplimiento)" : "");
        else if (recortePzsAgg > 0 && cupo > 0 && recortePzsAgg < cupo)
            resumen = $"Recorte por cupo en Tina: \"{fecha}\"" + (existenciaPzs > 0 && (g.Precio ?? 0) > 0 ? $" - {(int)Math.Floor(existenciaPzs / cupo)} Env de existencia" : "");
        else if (envsConsumo > 0)
            resumen = $"Consumo Inv: \"{fecha}\" Consumo: {(int)envsConsumo} env {(cargoPromDiaPzs > 0 ? (int)((pedidoPzsAgg - cargoPromDiaPzs) / cargoPromDiaPzs * 100) : 0)}% Arriba del promedio.";
        else if (existenciaPzs > 0 && existenciaPzs >= 0.80m * recortePzsAgg)
            resumen = $"Existencia CeVe: \"{fecha}\" - {(cupo != 0 ? (int)(existenciaPzs / cupo) : 0)} Env ({(recortePzsAgg > 0 ? (int)Math.Min(100m, 100m * existenciaPzs / recortePzsAgg) : 100)}% del recorte)";
        else if (!tienePm && pedidoFuturoCant > 0)
            resumen = $"Sin Pedido CeVe Últimos 7 días, pedido tránsito vta ({pedidoFuturoFechas})";
        else if (!tienePm)
            resumen = "Sin ejecución de Post-Mortem para esta fecha/item";
        else
            resumen = "Sin causa identificada";

        diagnosticos[key] = (causaPrincipal, causaSecundaria, resumen, envsPlanta, envsConsumo, existenciaPzs, cargoPromDiaPzs);
    }

    var cols = ColumnasCausasRecorte();

    using var tx = conn.BeginTransaction();
    using (var del = conn.CreateCommand()) { del.Transaction = tx; del.CommandText = "DELETE FROM CausasRecorteResultados WHERE Fecha_Venta BETWEEN $fi AND $ff"; del.Parameters.AddWithValue("$fi", fechaMin); del.Parameters.AddWithValue("$ff", fechaMax); del.ExecuteNonQuery(); }

    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    var paramNames = cols.Select((c, i) => "$p" + i).ToArray();
    ins.CommandText = $"INSERT INTO CausasRecorteResultados ({string.Join(",", cols.Select(c => $"[{c}]"))}) VALUES ({string.Join(",", paramNames)})";
    foreach (var pn in paramNames) ins.Parameters.Add(new SqliteParameter(pn, DBNull.Value));

    foreach (var r in filas)
    {
        var key = (r.Ceve, r.Item, r.Fecha);
        pm.TryGetValue(key, out var pmRow);
        fr.TryGetValue(key, out var frRow);
        grupos.TryGetValue(key, out var g);
        diagnosticos.TryGetValue(key, out var diag);

        var row = new Dictionary<string, object?> {
            ["Codigo_CeVe"] = r.Ceve, ["CeVe"] = r.CeveNombre, ["RegionLogistica"] = r.Region, ["Fecha_Venta"] = r.Fecha,
            ["NombreDia"] = r.NombreDia, ["Semana"] = r.Semana, ["Item"] = r.Item, ["DescripcionProducto"] = r.Desc,
            ["CategoriaResumida"] = r.Categoria, ["Marca"] = r.Marca, ["NombreCanal"] = r.Canal, ["Cupo"] = r.Cupo,
            ["Precio"] = r.Precio, ["PedidoPzs"] = r.PedidoPzs, ["PedidoUSD"] = r.PedidoUsd, ["CargoPzs"] = r.CargoPzs,
            ["CargoUSD"] = r.CargoUsd, ["CargoSinAumentoPzs"] = r.CargoSinAumentoPzs, ["CargoSinAumentoUSD"] = r.CargoSinAumentoUsd,
            ["RecortePzs"] = r.RecortePzs, ["RecorteUSD"] = r.RecorteUsd,
            ["Causa_Principal"] = diag.causaPrincipal, ["Causa_Secundaria"] = diag.causaSecundaria, ["Resumen"] = diag.resumen,
            ["Envs_Planta"] = diag.envsPlanta, ["Envs_Consumo"] = diag.envsConsumo, ["ExistenciaPzs"] = diag.existenciaPzs,
            ["Hoy_Pedido"] = frRow.pedidoCeve, ["Hoy_Entregado"] = frRow.embarque,
            ["Hoy_PedidoConsumo"] = g?.PedidoPzsAgg ?? 0, ["Hoy_CargoPromedioConsumo"] = diag.cargoPromDiaPzs,
        };
        for (int n = 1; n <= 6; n++)
        {
            row[$"Fecha_Transito{n}"] = pmRow?.FechaTransito[n - 1];
            row[$"Pedido_Fabrica{n}"] = pmRow?.PedidoFabrica[n - 1] ?? 0;
            row[$"Embarque_Real{n}"] = pmRow?.EmbarqueReal[n - 1] ?? 0;
            row[$"Cargo_Real{n}"] = pmRow?.CargoReal[n - 1] ?? 0;
            row[$"Cargo_Promedio{n}"] = pmRow?.CargoPromedio[n - 1] ?? 0;
        }

        for (int c = 0; c < cols.Count; c++) ins.Parameters[c].Value = row.TryGetValue(cols[c], out var v) ? (v ?? DBNull.Value) : DBNull.Value;
        ins.ExecuteNonQuery();
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO CausasRecorteEjecuciones (Archivo, FechaMin, FechaMax, Filas, EjecutadoEn) VALUES ($a,$fi,$ff,$n,$c)";
        log.Parameters.AddWithValue("$a", Path.GetFileName(archivo));
        log.Parameters.AddWithValue("$fi", fechaMin);
        log.Parameters.AddWithValue("$ff", fechaMax);
        log.Parameters.AddWithValue("$n", filas.Count);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }
    tx.Commit();

    var procesadosDir = Path.Combine(datosDir, "_Procesados", "Procesos/CausasRecorte");
    Directory.CreateDirectory(procesadosDir);
    var destino = Path.Combine(procesadosDir, Path.GetFileName(archivo));
    if (File.Exists(destino)) File.Delete(destino);
    File.Move(archivo, destino);

    return new { ok = true, filas = filas.Count, fechaMin, fechaMax, archivo = Path.GetFileName(archivo) };
}

// ── Cálculo Inventario Óptimo ────────────────────────────────────────────
// Sube un "resumen" de existencias (Fecha_venta, SCCode=CeVe, ItemOrg + 7
// columnas de existencia hoy/ayer por CE/CN) y calcula, por CeVe+Item,
// cuánto debería tener en existencia (Inventario Óptimo = demanda de la
// ventana de lead time + stock de seguridad), cruzando contra Productos,
// Participación - Tipo Movimiento (clasificación ABC/XYZ), Promedios de
// Pedido y Frecuencias Producto CeVes. Simplificación respecto al original:
// no hay DesviacionStdCarga en el extracto local de Promedios de Pedido
// (igual que en Existencia Teórica), así que el stock de seguridad usa solo
// DesviacionStdPedido. Igual que las demás cargas por fecha: cada ejecución
// reemplaza solo el rango de fechas del archivo, sin preview intermedio.
object EjecutarInventarioOptimo()
{
    var carpeta = Path.Combine(datosDir, "Procesos/InventarioOptimo");
    var archivo = UltimoArchivoCsv(carpeta);
    if (archivo is null) throw new InvalidOperationException("Sin archivo CSV en Datos/Procesos/InventarioOptimo. Deposita el extracto antes de ejecutar.");

    var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
    if (lines.Length < 2) throw new InvalidOperationException($"'{Path.GetFileName(archivo)}' está vacío.");

    var filas = new List<(DateTime fecha, string ceve, string item, decimal? existLvCe, decimal? existLvCn, decimal? existLvyCe, decimal? existLvyCn, decimal? existTotalIvy, decimal? existTotalIv, decimal? exisTotal)>();
    string? fechaMin = null, fechaMax = null;
    for (int i = 1; i < lines.Length; i++)
    {
        var f = SplitCsvLine(lines[i]);
        if (f.Length < 10) continue;
        var fechaIso = NormalizarFechaIso(f[0]);
        if (fechaIso.Length == 0) continue;
        if (fechaMin is null || string.CompareOrdinal(fechaIso, fechaMin) < 0) fechaMin = fechaIso;
        if (fechaMax is null || string.CompareOrdinal(fechaIso, fechaMax) > 0) fechaMax = fechaIso;
        filas.Add((
            DateTime.Parse(fechaIso, System.Globalization.CultureInfo.InvariantCulture),
            NormalizarCodigo(f[1]), NormalizarCodigo(f[2]),
            ParseDecN(f[3]), ParseDecN(f[4]), ParseDecN(f[5]), ParseDecN(f[6]), ParseDecN(f[7]), ParseDecN(f[8]), ParseDecN(f[9])));
    }
    if (filas.Count == 0 || fechaMin is null || fechaMax is null)
        throw new InvalidOperationException("El archivo no tiene filas válidas.");

    using var conn = new SqliteConnection(connStr);
    conn.Open();

    var ceves = new Dictionary<string, (string nombre, string region, string org)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Nombre, Region, Organizacion FROM Ceves";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var c = NormalizarCodigo(dr.GetString(0));
            if (c.Length > 0) ceves[c] = (dr.IsDBNull(1) ? "" : dr.GetString(1), dr.IsDBNull(2) ? "" : dr.GetString(2), dr.IsDBNull(3) ? "" : dr.GetString(3));
        }
    }

    var productos = new Dictionary<string, (string longName, decimal? price, decimal? trayCap, decimal? containerCap, string trayCode, string shelfLife, decimal? daysLife, string brand, string category)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT ItemCode, LongName, Price, TrayCapacity, ContainerCapacity, TrayCode, ShelfLife, DaysLife, Brand, CategoryItem FROM ProductosHub";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var item = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            if (item.Length == 0) continue;
            productos[item] = (
                dr.IsDBNull(1) ? "" : dr.GetString(1), dr.IsDBNull(2) ? null : ParseDecN(dr.GetString(2)),
                dr.IsDBNull(3) ? null : ParseDecN(dr.GetString(3)), dr.IsDBNull(4) ? null : ParseDecN(dr.GetString(4)),
                dr.IsDBNull(5) ? "" : dr.GetString(5), dr.IsDBNull(6) ? "" : dr.GetString(6),
                dr.IsDBNull(7) ? null : ParseDecN(dr.GetString(7)), dr.IsDBNull(8) ? "" : dr.GetString(8), dr.IsDBNull(9) ? "" : dr.GetString(9));
        }
    }

    var ptm = new Dictionary<(string ceve, string item), (string abc, string xyz)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodigoCeve, Item, ClasificacionABC, ClasificacionXYZ FROM ParticipacionTipoMovimiento";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            if (ceve.Length == 0) continue;
            ptm[(ceve, item)] = (dr.IsDBNull(2) ? "" : dr.GetString(2), dr.IsDBNull(3) ? "" : dr.GetString(3));
        }
    }

    var pvp = new Dictionary<(string ceve, string item, string dia), (decimal pedido, decimal carga, decimal desviacionPedido)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Dia, PromedioFinalPedido, PromedioFinalCarga, DesviacionStdPedido FROM PedidoVendedorPromedios";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var dia = (dr.IsDBNull(2) ? "" : dr.GetString(2)).Trim();
            if (ceve.Length == 0 || dia.Length == 0) continue;
            pvp[(ceve, item, dia)] = (dr.IsDBNull(3) ? 0m : Convert.ToDecimal(dr.GetValue(3)), dr.IsDBNull(4) ? 0m : Convert.ToDecimal(dr.GetValue(4)), dr.IsDBNull(5) ? 0m : Convert.ToDecimal(dr.GetValue(5)));
        }
    }

    var frec = new Dictionary<(string ceve, string item, string dia), (int leadTime, string frecuenciaDias)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Item, Dia, LeadTime, FrecuenciaDias FROM FrecuenciasConsolidadas";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var ceve = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            var item = NormalizarCodigo(dr.IsDBNull(1) ? "" : dr.GetString(1));
            var dia = (dr.IsDBNull(2) ? "" : dr.GetString(2)).Trim();
            if (ceve.Length == 0 || dia.Length == 0) continue;
            frec[(ceve, item, dia)] = (dr.IsDBNull(3) ? 0 : Convert.ToInt32(dr.GetValue(3)), dr.IsDBNull(4) ? "" : dr.GetString(4));
        }
    }

    var semanaPorFecha = new Dictionary<string, string>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT Fecha, Semana FROM CalendarioBimbo";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
            if (!dr.IsDBNull(0)) semanaPorFecha[dr.GetString(0)] = dr.IsDBNull(1) ? "" : dr.GetString(1);
    }

    var diasLunSab = new[] { "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado" };
    decimal MaxPedCarga((decimal pedido, decimal carga) v) => Math.Max(v.pedido, v.carga);

    var cols = ColumnasInventarioOptimo();

    using var tx = conn.BeginTransaction();
    using (var del = conn.CreateCommand()) { del.Transaction = tx; del.CommandText = "DELETE FROM InventarioOptimoResultados WHERE Fecha_venta BETWEEN $fi AND $ff"; del.Parameters.AddWithValue("$fi", fechaMin); del.Parameters.AddWithValue("$ff", fechaMax); del.ExecuteNonQuery(); }

    using var ins = conn.CreateCommand();
    ins.Transaction = tx;
    var paramNames = cols.Select((c, i) => "$p" + i).ToArray();
    ins.CommandText = $"INSERT INTO InventarioOptimoResultados ({string.Join(",", cols.Select(c => $"[{c}]"))}) VALUES ({string.Join(",", paramNames)})";
    foreach (var pn in paramNames) ins.Parameters.Add(new SqliteParameter(pn, DBNull.Value));

    foreach (var r in filas)
    {
        var dia = NombreDiaEs(r.fecha);
        var startIdx = StartIdxDeDia(dia);
        ceves.TryGetValue(r.ceve, out var ceveInfo);
        productos.TryGetValue(r.item, out var prod);
        ptm.TryGetValue((r.ceve, r.item), out var ptmRow);
        var cupo = prod.trayCap;

        bool tienePvp = pvp.TryGetValue((r.ceve, r.item, dia), out var pvpHoy);
        decimal? cargoPromEnv = tienePvp ? MaxPedCarga((pvpHoy.pedido, pvpHoy.carga)) : null;
        decimal? cargoPromPzs = (cargoPromEnv.HasValue && cupo.HasValue) ? cargoPromEnv.Value * cupo.Value : null;
        decimal? desvStandar = tienePvp ? pvpHoy.desviacionPedido : null;
        decimal? desvStandarPzs = (desvStandar.HasValue && cupo.HasValue) ? desvStandar.Value * cupo.Value : null;

        bool tieneFrec = frec.TryGetValue((r.ceve, r.item, dia), out var frRow);
        int leadTimeEf = (tieneFrec && frRow.leadTime != 0) ? frRow.leadTime : 1;

        decimal? factor = ptmRow.abc switch { "A" => 2.05m, "B" => 1.64m, "C" => 1.28m, "D" => 0.99m, _ => null };

        decimal cargoVentanaEnv = 0, promedioSemanal = 0;
        for (int d = 0; d < 6; d++)
        {
            if (!pvp.TryGetValue((r.ceve, r.item, diasLunSab[d]), out var pvD)) continue;
            var maxD = MaxPedCarga((pvD.pedido, pvD.carga));
            promedioSemanal += maxD;
            if (((d - startIdx + 6) % 6) < leadTimeEf) cargoVentanaEnv += maxD;
        }
        decimal? promedioSemanalPzs = cupo.HasValue ? promedioSemanal * cupo.Value : null;

        decimal? ss = (desvStandarPzs.HasValue && factor.HasValue)
            ? desvStandarPzs.Value * factor.Value * (decimal)Math.Sqrt(leadTimeEf)
            : null;
        decimal invopt = (cupo.HasValue ? cargoVentanaEnv * cupo.Value : 0) + (ss ?? 0);

        var row = new Dictionary<string, object?> {
            ["Fecha_venta"] = r.fecha.ToString("yyyy-MM-dd"), ["SCCode"] = r.ceve, ["ItemOrg"] = r.item,
            ["Exist_lv_pzs_CE"] = r.existLvCe, ["Exist_lv_pzs_CN"] = r.existLvCn, ["Exist_lvy_pzs_CE"] = r.existLvyCe, ["Exist_lvy_pzs_CN"] = r.existLvyCn,
            ["Exist_total_ivy"] = r.existTotalIvy, ["Exist_total_iv"] = r.existTotalIv, ["Exis_Total"] = r.exisTotal,
            ["dia"] = dia, ["semana"] = semanaPorFecha.TryGetValue(r.fecha.ToString("yyyy-MM-dd"), out var sem) && int.TryParse(sem, out var semN) ? semN : null,
            ["anio"] = r.fecha.Year, ["nombre_ceve"] = ceveInfo.nombre, ["region"] = ceveInfo.region, ["organizacion"] = ceveInfo.org,
            ["nombre_producto"] = prod.longName, ["marca"] = prod.brand, ["categoria"] = prod.category, ["precio"] = prod.price,
            ["cupo"] = cupo, ["cupo_contenedor"] = prod.containerCap, ["tipo_envase"] = prod.trayCode, ["tipo_vida"] = prod.shelfLife, ["dias_vida"] = prod.daysLife,
            ["tipo_part"] = ptmRow.abc, ["tipo_mov"] = ptmRow.xyz, ["cargoprom_env"] = cargoPromEnv, ["cargoprom_pzs"] = cargoPromPzs,
            ["desv_standar"] = desvStandar, ["desv_standar_pzs"] = desvStandarPzs, ["leadtime"] = leadTimeEf, ["frecuencia"] = tieneFrec ? frRow.frecuenciaDias : null,
            ["Factor"] = factor, ["Promedio_semanal"] = promedioSemanal, ["Promedio_semanal_pzs"] = promedioSemanalPzs, ["ss"] = ss, ["Invopt"] = invopt,
        };

        for (int c = 0; c < cols.Count; c++) ins.Parameters[c].Value = row.TryGetValue(cols[c], out var v) ? (v ?? DBNull.Value) : DBNull.Value;
        ins.ExecuteNonQuery();
    }

    using (var log = conn.CreateCommand())
    {
        log.Transaction = tx;
        log.CommandText = "INSERT OR REPLACE INTO InventarioOptimoEjecuciones (Archivo, FechaMin, FechaMax, Filas, EjecutadoEn) VALUES ($a,$fi,$ff,$n,$c)";
        log.Parameters.AddWithValue("$a", Path.GetFileName(archivo));
        log.Parameters.AddWithValue("$fi", fechaMin);
        log.Parameters.AddWithValue("$ff", fechaMax);
        log.Parameters.AddWithValue("$n", filas.Count);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }
    tx.Commit();

    var procesadosDir = Path.Combine(datosDir, "_Procesados", "Procesos/InventarioOptimo");
    Directory.CreateDirectory(procesadosDir);
    var destino = Path.Combine(procesadosDir, Path.GetFileName(archivo));
    if (File.Exists(destino)) File.Delete(destino);
    File.Move(archivo, destino);

    return new { ok = true, filas = filas.Count, fechaMin, fechaMax, archivo = Path.GetFileName(archivo) };
}

// ── Causas Recorte: tablero (filtros, vista agrupada, Top N) ───────────────
// Lee CausasRecorteResultados filtrado a memoria y arma las 3 vistas con
// LINQ en vez de SQL dinámico — SQLite no tiene las funciones de ventana que
// usa el original para la "causa predominante" por grupo, y un GROUP BY
// armado a mano por combinación de campos es más frágil que agrupar en C#.
// Nota de alcance: se deja fuera el desglose día-por-día expandible y el
// "pedido en tránsito hacia adelante" de la vista agrupada/Top N original
// (son un detalle adicional sobre el grupo, no el cálculo central); el resto
// — filtros, orden, paginación, causa predominante/secundaria, Top N por
// categoría con desglose de CeVes — sí está completo.
List<CrReadRow> LeerCausasRecorteFiltrado(string? fechaInicio, string? fechaFin, string? codigoCeve, string? canal, string? causa, string? categoria, string? marca, string? region, string? item)
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    var where = new List<string>();
    if (!string.IsNullOrWhiteSpace(fechaInicio)) where.Add("Fecha_Venta >= $fi");
    if (!string.IsNullOrWhiteSpace(fechaFin)) where.Add("Fecha_Venta <= $ff");
    if (!string.IsNullOrWhiteSpace(codigoCeve)) where.Add("Codigo_CeVe = $cv");
    if (!string.IsNullOrWhiteSpace(canal)) where.Add("NombreCanal = $cn");
    if (!string.IsNullOrWhiteSpace(causa)) where.Add("Causa_Principal = $ca");
    if (!string.IsNullOrWhiteSpace(categoria)) where.Add("CategoriaResumida = $ct");
    if (!string.IsNullOrWhiteSpace(marca)) where.Add("Marca = $ma");
    if (!string.IsNullOrWhiteSpace(region)) where.Add("RegionLogistica = $rg");
    if (!string.IsNullOrWhiteSpace(item)) where.Add("(Item LIKE $it OR DescripcionProducto LIKE $it)");
    cmd.CommandText = "SELECT Codigo_CeVe,CeVe,RegionLogistica,Fecha_Venta,NombreDia,Item,DescripcionProducto,Cupo,Precio,CategoriaResumida,Marca,NombreCanal,RecortePzs,RecorteUSD,Causa_Principal,Causa_Secundaria,Resumen,Envs_Planta,Envs_Consumo,ExistenciaPzs FROM CausasRecorteResultados"
        + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "");
    if (!string.IsNullOrWhiteSpace(fechaInicio)) cmd.Parameters.AddWithValue("$fi", NormalizarFechaIso(fechaInicio) is { Length: > 0 } a ? a : fechaInicio);
    if (!string.IsNullOrWhiteSpace(fechaFin)) cmd.Parameters.AddWithValue("$ff", NormalizarFechaIso(fechaFin) is { Length: > 0 } b ? b : fechaFin);
    if (!string.IsNullOrWhiteSpace(codigoCeve)) cmd.Parameters.AddWithValue("$cv", codigoCeve);
    if (!string.IsNullOrWhiteSpace(canal)) cmd.Parameters.AddWithValue("$cn", canal);
    if (!string.IsNullOrWhiteSpace(causa)) cmd.Parameters.AddWithValue("$ca", causa);
    if (!string.IsNullOrWhiteSpace(categoria)) cmd.Parameters.AddWithValue("$ct", categoria);
    if (!string.IsNullOrWhiteSpace(marca)) cmd.Parameters.AddWithValue("$ma", marca);
    if (!string.IsNullOrWhiteSpace(region)) cmd.Parameters.AddWithValue("$rg", region);
    if (!string.IsNullOrWhiteSpace(item)) cmd.Parameters.AddWithValue("$it", $"%{item}%");

    var list = new List<CrReadRow>();
    using var dr = cmd.ExecuteReader();
    decimal? DecN(int i) => dr.IsDBNull(i) ? null : Convert.ToDecimal(dr.GetValue(i));
    while (dr.Read())
        list.Add(new CrReadRow
        {
            CodigoCeve = dr.IsDBNull(0) ? "" : dr.GetString(0), Ceve = dr.IsDBNull(1) ? null : dr.GetString(1),
            Region = dr.IsDBNull(2) ? null : dr.GetString(2), Fecha = dr.IsDBNull(3) ? "" : dr.GetString(3),
            NombreDia = dr.IsDBNull(4) ? null : dr.GetString(4), Item = dr.IsDBNull(5) ? "" : dr.GetString(5),
            Descripcion = dr.IsDBNull(6) ? null : dr.GetString(6), Cupo = dr.IsDBNull(7) ? null : Convert.ToInt32(dr.GetValue(7)),
            Precio = DecN(8), Categoria = dr.IsDBNull(9) ? null : dr.GetString(9), Marca = dr.IsDBNull(10) ? null : dr.GetString(10),
            Canal = dr.IsDBNull(11) ? null : dr.GetString(11), RecortePzs = DecN(12) ?? 0, RecorteUsd = DecN(13) ?? 0,
            CausaPrincipal = dr.IsDBNull(14) ? null : dr.GetString(14), CausaSecundaria = dr.IsDBNull(15) ? null : dr.GetString(15),
            Resumen = dr.IsDBNull(16) ? null : dr.GetString(16), EnvsPlanta = DecN(17), EnvsConsumo = DecN(18), ExistenciaPzs = DecN(19),
        });
    return list;
}

(decimal? env, decimal? residuo) SplitRecorteEnvases(decimal recortePzs, int? cupo) =>
    cupo is > 0 ? (Math.Floor(recortePzs / cupo.Value), recortePzs - Math.Floor(recortePzs / cupo.Value) * cupo.Value) : (null, recortePzs);

// ── App web ──────────────────────────────────────────────────────────────
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:5255");
var app = builder.Build();

app.UseDefaultFiles();
// index.html nunca se cachea (siempre pide la versión actual al
// servidor) — los archivos dentro de assets/ sí tienen nombre único
// por build (hash en el nombre), así que esos sí pueden cachearse
// fuerte sin riesgo de quedar viendo una versión vieja del frontend.
app.UseStaticFiles(new Microsoft.AspNetCore.Builder.StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.File.Name.Equals("index.html", StringComparison.OrdinalIgnoreCase))
            ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
    },
});

app.MapGet("/api/ceves/actuales", () =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT CodCeve, Nombre, Region, Organizacion, AreaNegocio, Gerente, CorreoGerente, Subgerente, CorreoSubgerente, Coordinador, CorreoCoordinador, Direccion, Latitud, Longitud, CeveSinergia, TurnoLaboral FROM Ceves ORDER BY CodCeve";
    using var dr = cmd.ExecuteReader();
    var rows = new List<object>();
    while (dr.Read())
        rows.Add(new
        {
            codCeve = dr.GetString(0), nombre = dr.GetString(1), region = dr.GetString(2),
            organizacion = dr.GetString(3), areaNegocio = dr.GetString(4), gerente = dr.GetString(5),
            correoGerente = dr.GetString(6), subgerente = dr.GetString(7), correoSubgerente = dr.GetString(8),
            coordinador = dr.GetString(9), correoCoordinador = dr.GetString(10), direccion = dr.GetString(11),
            latitud = dr.GetString(12), longitud = dr.GetString(13), ceveSinergia = dr.GetString(14),
            turnoLaboral = dr.GetString(15),
        });
    return Results.Ok(rows);
});

// Endpoint genérico de solo-lectura: devuelve todas las filas de una tabla
// como diccionarios {columna: valor}, para no repetir un mapeo a mano por
// catálogo (estos son catálogos de consulta simple, sin edición en pantalla).
List<Dictionary<string, object?>> LeerTabla(string tabla, string orderBy)
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = $"SELECT * FROM {tabla} ORDER BY {orderBy}";
    using var dr = cmd.ExecuteReader();
    var rows = new List<Dictionary<string, object?>>();
    while (dr.Read())
    {
        var row = new Dictionary<string, object?>();
        for (int i = 0; i < dr.FieldCount; i++) row[dr.GetName(i)] = dr.IsDBNull(i) ? null : dr.GetValue(i);
        rows.Add(row);
    }
    return rows;
}

app.MapGet("/api/catalogos/productos-hub", () => Results.Ok(LeerTabla("ProductosHub", "ItemCode")));
app.MapGet("/api/catalogos/calendario", () => Results.Ok(LeerTabla("CalendarioBimbo", "Fecha")));
app.MapGet("/api/catalogos/plantas", () => Results.Ok(LeerTabla("CatPlantasCedis", "Planta")));

app.MapGet("/api/cargas/pedido-ceve-planta", () => Results.Ok(LeerTabla("PedidosCevePlanta", "FechaVenta DESC")));
app.MapGet("/api/cargas/pedido-oracle", () => Results.Ok(LeerTabla("PedidosOracle", "RequiredShipDate DESC")));
app.MapGet("/api/cargas/existencia-ceve-manual", () => Results.Ok(LeerTabla("ExistenciaCeveManual", "FechaVenta DESC")));
app.MapGet("/api/cargas/pedido-vs-cargo-real", () => Results.Ok(LeerTabla("PedidoVsCargoReal", "FechaVenta DESC")));
app.MapGet("/api/cargas/participacion-tipo-movimiento", () => Results.Ok(LeerTabla("ParticipacionTipoMovimiento", "CodigoCeve")));
app.MapGet("/api/catalogos/cadena-suministro", () => Results.Ok(LeerTabla("CatCadenaSupministro", "CodCeve")));
app.MapGet("/api/cargas/remisiones", () => Results.Ok(LeerTabla("RemisionesProductosCEQ", "FechaVenta DESC")));
app.MapGet("/api/cargas/seguimiento-servicios", () => Results.Ok(LeerTabla("SeguimientoServicios", "DispatchDate DESC")));

// ── Seguimiento Servicios: resumen de quién ya mandó su archivo ────────────
// Cruza el catálogo de CeVes (ya cargado) contra lo que llegó en
// SeguimientoServicios para la fecha pedida (o la más reciente cargada).
// Sistema='IVY' es el reporte de RTM, 'IV' el de Integral Vending -- se
// agregan aparte para saber si cada sistema llegó, no solo si llegó "algo".
app.MapGet("/api/seguimiento-servicios/fechas", () =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT DISTINCT DispatchDate FROM SeguimientoServicios WHERE DispatchDate IS NOT NULL AND DispatchDate <> '' ORDER BY DispatchDate DESC";
    using var dr = cmd.ExecuteReader();
    var list = new List<string>();
    while (dr.Read()) if (!dr.IsDBNull(0)) list.Add(dr.GetString(0));
    return Results.Ok(list);
});
app.MapGet("/api/seguimiento-servicios/resumen", (string? fecha) =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();

    if (string.IsNullOrWhiteSpace(fecha))
    {
        using var fc = conn.CreateCommand();
        fc.CommandText = "SELECT MAX(DispatchDate) FROM SeguimientoServicios";
        var r = fc.ExecuteScalar();
        fecha = r is string s && s.Length > 0 ? s : DateTime.UtcNow.ToString("yyyy-MM-dd");
    }

    var ceves = new List<(string cod, string nombre, string region, string org, bool rtmActivo, bool ivActivo)>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT CodCeve, Nombre, Region, Organizacion, RTM, IntegralVending FROM Ceves";
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var cod = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            if (cod.Length == 0) continue;
            ceves.Add((cod, dr.IsDBNull(1) ? "" : dr.GetString(1), dr.IsDBNull(2) ? "" : dr.GetString(2), dr.IsDBNull(3) ? "" : dr.GetString(3),
                !dr.IsDBNull(4) && dr.GetString(4) == "Activo", !dr.IsDBNull(5) && dr.GetString(5) == "Activo"));
        }
    }

    var filasPorCeve = new Dictionary<string, decimal>();
    var rtmFilasPorCeve = new Dictionary<string, decimal>();
    var ivFilasPorCeve = new Dictionary<string, decimal>();
    using (var cmd = conn.CreateCommand())
    {
        cmd.CommandText = "SELECT SCCode, Sistema, Filas FROM SeguimientoServicios WHERE DispatchDate = $f";
        cmd.Parameters.AddWithValue("$f", fecha);
        using var dr = cmd.ExecuteReader();
        while (dr.Read())
        {
            var cod = NormalizarCodigo(dr.IsDBNull(0) ? "" : dr.GetString(0));
            if (cod.Length == 0) continue;
            var sistema = dr.IsDBNull(1) ? "" : dr.GetString(1);
            var filas = dr.IsDBNull(2) ? 0m : Convert.ToDecimal(dr.GetValue(2));
            filasPorCeve[cod] = filasPorCeve.GetValueOrDefault(cod) + filas;
            if (sistema == "IVY") rtmFilasPorCeve[cod] = rtmFilasPorCeve.GetValueOrDefault(cod) + filas;
            else if (sistema == "IV") ivFilasPorCeve[cod] = ivFilasPorCeve.GetValueOrDefault(cod) + filas;
        }
    }

    var resultado = new List<object>();
    int enviados = 0;
    foreach (var c in ceves.OrderBy(c => filasPorCeve.ContainsKey(c.cod) ? 1 : 0).ThenBy(c => c.cod))
    {
        bool enviado = filasPorCeve.ContainsKey(c.cod);
        if (enviado) enviados++;
        bool rtmEnviado = rtmFilasPorCeve.ContainsKey(c.cod);
        bool ivEnviado = ivFilasPorCeve.ContainsKey(c.cod);
        resultado.Add(new {
            codCeve = c.cod, nombre = c.nombre, region = c.region, organizacion = c.org,
            enviado, filas = enviado ? (decimal?)filasPorCeve[c.cod] : null,
            rtmActivo = c.rtmActivo, rtmEnviado, rtmFilas = rtmEnviado ? (decimal?)rtmFilasPorCeve[c.cod] : null,
            ivActivo = c.ivActivo, ivEnviado, ivFilas = ivEnviado ? (decimal?)ivFilasPorCeve[c.cod] : null,
        });
    }

    return Results.Ok(new { fecha, total = ceves.Count, enviados, faltantes = ceves.Count - enviados, ceves = resultado });
});

app.MapPost("/api/procesos/fill-rate/ejecutar", (FillRateRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req?.FechaInicio) || string.IsNullOrWhiteSpace(req?.FechaFin))
        return Results.BadRequest(new { error = "fechaInicio y fechaFin son requeridas (yyyy-MM-dd)." });
    try { return Results.Ok(EjecutarFillRate(req.FechaInicio, req.FechaFin)); }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});
app.MapGet("/api/procesos/fill-rate/resultados", () => Results.Ok(LeerTabla("FillRateResultados", "CodigoCeve, Item, FechaVenta")));
app.MapGet("/api/procesos/fill-rate/estado", () => Results.Ok(LeerTabla("ProcesosLog", "Proceso").FirstOrDefault(r => r["Proceso"]?.ToString() == "Fill Rate")));

app.MapGet("/api/catalogos/promedios-pedido", () => Results.Ok(LeerTabla("PedidoVendedorPromedios", "CodCeve")));
app.MapGet("/api/catalogos/frecuencias-producto-ceves", () => Results.Ok(LeerTabla("FrecuenciasConsolidadas", "CodCeve")));
app.MapGet("/api/cargas/inventario-resumen", () => Results.Ok(LeerTabla("InventarioResumen", "FechaCaptura DESC")));

app.MapPost("/api/procesos/existencia-teorica/ejecutar", (ExistenciaTeoricaRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req?.FechaSel))
        return Results.BadRequest(new { error = "fechaSel es requerida (yyyy-MM-dd)." });
    try { return Results.Ok(EjecutarExistenciaTeorica(req.FechaSel, req.BaseExistencia ?? "Aut")); }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});
app.MapGet("/api/procesos/existencia-teorica/fechas", () =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT FechaSel, BaseExistencia, Filas, EjecutadoEn FROM ExistenciaTeoricaEjecuciones ORDER BY FechaSel DESC";
    using var dr = cmd.ExecuteReader();
    var rows = new List<object>();
    while (dr.Read())
        rows.Add(new { fechaSel = dr.GetString(0), baseExistencia = dr.IsDBNull(1) ? "" : dr.GetString(1), filas = dr.GetInt64(2), ejecutadoEn = dr.IsDBNull(3) ? "" : dr.GetString(3) });
    return Results.Ok(rows);
});
app.MapGet("/api/procesos/existencia-teorica/resultados", (string? fecha) =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    var fechaEf = fecha;
    if (string.IsNullOrWhiteSpace(fechaEf))
    {
        using var cmdU = conn.CreateCommand();
        cmdU.CommandText = "SELECT FechaSel FROM ExistenciaTeoricaEjecuciones ORDER BY EjecutadoEn DESC LIMIT 1";
        fechaEf = cmdU.ExecuteScalar() as string;
    }
    if (string.IsNullOrWhiteSpace(fechaEf)) return Results.Ok(new List<object>());
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT * FROM ExistenciaTeoricaResultados WHERE Fecha_Venta = $f ORDER BY Cod_ceve, Item";
    cmd.Parameters.AddWithValue("$f", fechaEf);
    using var dr = cmd.ExecuteReader();
    var rows = new List<Dictionary<string, object?>>();
    while (dr.Read())
    {
        var row = new Dictionary<string, object?>();
        for (int i = 0; i < dr.FieldCount; i++) row[dr.GetName(i)] = dr.IsDBNull(i) ? null : dr.GetValue(i);
        rows.Add(row);
    }
    return Results.Ok(rows);
});

app.MapPost("/api/procesos/post-mortem/ejecutar", (PostMortemRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req?.FechaVenta))
        return Results.BadRequest(new { error = "fechaVenta es requerida (yyyy-MM-dd)." });
    try { return Results.Ok(EjecutarPostMortem(req.FechaVenta)); }
    catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});
app.MapGet("/api/procesos/post-mortem/fechas", () =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT FechaVenta, Filas, EjecutadoEn FROM PostMortemEjecuciones ORDER BY FechaVenta DESC";
    using var dr = cmd.ExecuteReader();
    var rows = new List<object>();
    while (dr.Read())
        rows.Add(new { fechaVenta = dr.GetString(0), filas = dr.GetInt64(1), ejecutadoEn = dr.IsDBNull(2) ? "" : dr.GetString(2) });
    return Results.Ok(rows);
});
app.MapGet("/api/procesos/post-mortem/resultados", (string? fecha) =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    var fechaEf = fecha;
    if (string.IsNullOrWhiteSpace(fechaEf))
    {
        using var cmdU = conn.CreateCommand();
        cmdU.CommandText = "SELECT FechaVenta FROM PostMortemEjecuciones ORDER BY EjecutadoEn DESC LIMIT 1";
        fechaEf = cmdU.ExecuteScalar() as string;
    }
    if (string.IsNullOrWhiteSpace(fechaEf)) return Results.Ok(new List<object>());
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT * FROM PostMortemResultados WHERE Fecha_Venta = $f ORDER BY Cod_ceve, Item";
    cmd.Parameters.AddWithValue("$f", fechaEf);
    using var dr = cmd.ExecuteReader();
    var rows = new List<Dictionary<string, object?>>();
    while (dr.Read())
    {
        var row = new Dictionary<string, object?>();
        for (int i = 0; i < dr.FieldCount; i++) row[dr.GetName(i)] = dr.IsDBNull(i) ? null : dr.GetValue(i);
        rows.Add(row);
    }
    return Results.Ok(rows);
});

app.MapPost("/api/procesos/causas-recorte/ejecutar", () =>
{
    try { return Results.Ok(EjecutarCausasRecorte()); }
    catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});
app.MapGet("/api/procesos/causas-recorte/ejecuciones", () => Results.Ok(LeerTabla("CausasRecorteEjecuciones", "EjecutadoEn DESC")));
app.MapGet("/api/procesos/causas-recorte/resultados", (string? fecha) =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    if (string.IsNullOrWhiteSpace(fecha))
    {
        cmd.CommandText = "SELECT * FROM CausasRecorteResultados ORDER BY Fecha_Venta DESC, Codigo_CeVe, Item LIMIT 500";
    }
    else
    {
        cmd.CommandText = "SELECT * FROM CausasRecorteResultados WHERE Fecha_Venta = $f ORDER BY Codigo_CeVe, Item, NombreCanal";
        cmd.Parameters.AddWithValue("$f", fecha);
    }
    using var dr = cmd.ExecuteReader();
    var rows = new List<Dictionary<string, object?>>();
    while (dr.Read())
    {
        var row = new Dictionary<string, object?>();
        for (int i = 0; i < dr.FieldCount; i++) row[dr.GetName(i)] = dr.IsDBNull(i) ? null : dr.GetValue(i);
        rows.Add(row);
    }
    return Results.Ok(rows);
});

app.MapGet("/api/procesos/causas-recorte/filtros", () =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    List<string> Distintos(string sql) { using var c = conn.CreateCommand(); c.CommandText = sql; using var d = c.ExecuteReader(); var l = new List<string>(); while (d.Read()) if (!d.IsDBNull(0)) l.Add(d.GetString(0)); return l; }
    var ceves = new List<object>();
    using (var c = conn.CreateCommand())
    {
        c.CommandText = "SELECT DISTINCT Codigo_CeVe, CeVe FROM CausasRecorteResultados WHERE Codigo_CeVe IS NOT NULL ORDER BY CeVe";
        using var d = c.ExecuteReader();
        while (d.Read()) ceves.Add(new { codigoCeve = d.GetString(0), ceve = d.IsDBNull(1) ? d.GetString(0) : d.GetString(1) });
    }
    return Results.Ok(new
    {
        ceves,
        canales = Distintos("SELECT DISTINCT NombreCanal FROM CausasRecorteResultados WHERE NombreCanal IS NOT NULL ORDER BY NombreCanal"),
        categorias = Distintos("SELECT DISTINCT CategoriaResumida FROM CausasRecorteResultados WHERE CategoriaResumida IS NOT NULL ORDER BY CategoriaResumida"),
        marcas = Distintos("SELECT DISTINCT Marca FROM CausasRecorteResultados WHERE Marca IS NOT NULL ORDER BY Marca"),
        regiones = Distintos("SELECT DISTINCT RegionLogistica FROM CausasRecorteResultados WHERE RegionLogistica IS NOT NULL ORDER BY RegionLogistica"),
        causas = Distintos("SELECT DISTINCT Causa_Principal FROM CausasRecorteResultados WHERE Causa_Principal IS NOT NULL ORDER BY Causa_Principal"),
    });
});

app.MapGet("/api/procesos/causas-recorte/tablero", (string? fechaInicio, string? fechaFin, string? codigoCeve, string? canal, string? causa,
    string? categoria, string? marca, string? region, string? item, string? sortBy, string? sortDir, int page = 1, int pageSize = 100) =>
{
    var rows = LeerCausasRecorteFiltrado(fechaInicio, fechaFin, codigoCeve, canal, causa, categoria, marca, region, item);
    var total = rows.Count;
    var totalRecortePzs = rows.Sum(r => r.RecortePzs);
    var totalRecorteUsd = rows.Sum(r => r.RecorteUsd);

    bool asc = string.Equals(sortDir, "asc", StringComparison.OrdinalIgnoreCase);
    IEnumerable<CrReadRow> ordenado = sortBy switch
    {
        "recortePzs" => asc ? rows.OrderBy(r => r.RecortePzs) : rows.OrderByDescending(r => r.RecortePzs),
        "recorteUsd" => asc ? rows.OrderBy(r => r.RecorteUsd) : rows.OrderByDescending(r => r.RecorteUsd),
        "fecha" => asc ? rows.OrderBy(r => r.Fecha) : rows.OrderByDescending(r => r.Fecha),
        "ceve" => asc ? rows.OrderBy(r => r.Ceve) : rows.OrderByDescending(r => r.Ceve),
        "item" => asc ? rows.OrderBy(r => r.Item) : rows.OrderByDescending(r => r.Item),
        _ => rows.OrderByDescending(r => r.Fecha).ThenByDescending(r => r.RecortePzs),
    };

    var pagina = ordenado.Skip((Math.Max(1, page) - 1) * pageSize).Take(pageSize).Select(r =>
    {
        var (env, residuo) = SplitRecorteEnvases(r.RecortePzs, r.Cupo);
        var existenciaEnv = (r.Cupo is > 0 && r.ExistenciaPzs != null) ? Math.Floor(r.ExistenciaPzs.Value / r.Cupo.Value) : (decimal?)null;
        var existenciaUsd = (r.ExistenciaPzs != null && r.Precio != null) ? r.ExistenciaPzs.Value * r.Precio.Value : (decimal?)null;
        return new
        {
            codigoCeve = r.CodigoCeve, ceve = r.Ceve, region = r.Region, fechaVenta = r.Fecha, nombreDia = r.NombreDia,
            item = r.Item, descripcion = r.Descripcion, cupo = r.Cupo, categoria = r.Categoria, marca = r.Marca, canal = r.Canal,
            recortePzs = r.RecortePzs, recorteEnv = env, recorteResiduo = residuo, recorteUsd = r.RecorteUsd,
            existenciaPzs = r.ExistenciaPzs, existenciaEnv, existenciaUsd,
            causaPrincipal = r.CausaPrincipal, causaSecundaria = r.CausaSecundaria, resumen = r.Resumen,
            envsPlanta = r.EnvsPlanta, envsConsumo = r.EnvsConsumo,
        };
    }).ToList();

    return Results.Ok(new { total, totalRecortePzs, totalRecorteUsd, rows = pagina });
});

app.MapGet("/api/procesos/causas-recorte/agrupado", (string groupBy, string? fechaInicio, string? fechaFin, string? codigoCeve, string? canal,
    string? causa, string? categoria, string? marca, string? region, string? item, string? sortBy, string? sortDir, int page = 1, int pageSize = 50) =>
{
    var camposValidos = new HashSet<string> { "fecha", "ceve", "item", "categoria", "canal", "marca" };
    var keys = (groupBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Where(camposValidos.Contains).Distinct().ToList();
    if (keys.Count == 0) return Results.BadRequest(new { error = "Selecciona al menos un campo para agrupar (fecha, ceve, item, categoria, canal, marca)." });

    var rows = LeerCausasRecorteFiltrado(fechaInicio, fechaFin, codigoCeve, canal, causa, categoria, marca, region, item);

    string ClaveDe(CrReadRow r, string k) => k switch
    {
        "fecha" => r.Fecha,
        "ceve" => $"{r.CodigoCeve} - {r.Ceve}",
        "item" => $"{r.Item} - {r.Descripcion}",
        "categoria" => r.Categoria ?? "Sin categoría",
        "canal" => r.Canal ?? "Sin canal",
        "marca" => r.Marca ?? "Sin marca",
        _ => "",
    };

    var grupos = rows.GroupBy(r => string.Join("\u0001", keys.Select(k => ClaveDe(r, k))))
        .Select(g =>
        {
            var primero = g.First();
            var porCausa = g.GroupBy(r => r.CausaPrincipal ?? "Sin causa identificada")
                .Select(cg => (causa: cg.Key, pzs: cg.Sum(r => r.RecortePzs)))
                .OrderByDescending(c => c.pzs).ToList();
            var dict = new Dictionary<string, object?>();
            foreach (var k in keys) dict[k] = ClaveDe(primero, k);
            if (keys.Contains("ceve")) dict["region"] = primero.Region;
            dict["filas"] = g.Count();
            dict["recortePzs"] = g.Sum(r => r.RecortePzs);
            dict["recorteUsd"] = g.Sum(r => r.RecorteUsd);
            dict["causaPredominante"] = porCausa.Count > 0 ? porCausa[0].causa : null;
            dict["causaSecundaria"] = porCausa.Count > 1 ? porCausa[1].causa : null;
            return dict;
        }).ToList();

    var totalGrupos = grupos.Count;
    var totalRecortePzs = rows.Sum(r => r.RecortePzs);
    var totalRecorteUsd = rows.Sum(r => r.RecorteUsd);

    bool asc = string.Equals(sortDir, "asc", StringComparison.OrdinalIgnoreCase);
    decimal RecPzs(Dictionary<string, object?> d) => (decimal)(d["recortePzs"] ?? 0m);
    IEnumerable<Dictionary<string, object?>> ordenado = sortBy switch
    {
        "recorteUsd" => asc ? grupos.OrderBy(d => (decimal)(d["recorteUsd"] ?? 0m)) : grupos.OrderByDescending(d => (decimal)(d["recorteUsd"] ?? 0m)),
        "filas" => asc ? grupos.OrderBy(d => (int)(d["filas"] ?? 0)) : grupos.OrderByDescending(d => (int)(d["filas"] ?? 0)),
        _ => asc ? grupos.OrderBy(RecPzs) : grupos.OrderByDescending(RecPzs),
    };
    var pagina = ordenado.Skip((Math.Max(1, page) - 1) * pageSize).Take(pageSize).ToList();

    return Results.Ok(new { totalGrupos, totalRecortePzs, totalRecorteUsd, rows = pagina });
});

app.MapGet("/api/procesos/causas-recorte/top-n", (string categoria, int topProductos, int topCeves, string? unidad, string? orden,
    string? fechaInicio, string? fechaFin, string? canal, string? causa, string? marca, string? region) =>
{
    if (string.IsNullOrWhiteSpace(categoria)) return Results.BadRequest(new { error = "Selecciona una categoría." });
    topProductos = Math.Clamp(topProductos <= 0 ? 10 : topProductos, 1, 100);
    topCeves = Math.Clamp(topCeves <= 0 ? 5 : topCeves, 1, 50);
    bool usd = string.Equals(unidad, "usd", StringComparison.OrdinalIgnoreCase);
    bool asc = string.Equals(orden, "asc", StringComparison.OrdinalIgnoreCase);

    var rows = LeerCausasRecorteFiltrado(fechaInicio, fechaFin, null, canal, causa, categoria, marca, region, null);

    var porItem = rows.GroupBy(r => r.Item).Select(g => new
    {
        item = g.Key,
        descripcion = g.Select(r => r.Descripcion).FirstOrDefault(d => !string.IsNullOrEmpty(d)),
        totalPzs = g.Sum(r => r.RecortePzs),
        totalUsd = g.Sum(r => r.RecorteUsd),
        filas = g.ToList(),
    });
    porItem = usd
        ? (asc ? porItem.OrderBy(x => x.totalUsd) : porItem.OrderByDescending(x => x.totalUsd))
        : (asc ? porItem.OrderBy(x => x.totalPzs) : porItem.OrderByDescending(x => x.totalPzs));
    var topItems = porItem.Take(topProductos).ToList();

    var resultado = topItems.Select(it =>
    {
        var porCeve = it.filas.GroupBy(r => (r.CodigoCeve, r.Ceve)).Select(g =>
        {
            var porCausa = g.GroupBy(r => r.CausaPrincipal ?? "Sin causa identificada")
                .Select(cg => new { causa = cg.Key, pzs = cg.Sum(r => r.RecortePzs), usd = cg.Sum(r => r.RecorteUsd), filas = cg.Count(), resumen = cg.Select(r => r.Resumen).FirstOrDefault() })
                .OrderByDescending(c => usd ? c.usd : c.pzs).ToList();
            return new
            {
                codigoCeve = g.Key.CodigoCeve, ceve = g.Key.Ceve,
                totalPzs = g.Sum(r => r.RecortePzs), totalUsd = g.Sum(r => r.RecorteUsd),
                causas = porCausa,
            };
        });
        porCeve = usd ? porCeve.OrderByDescending(c => c.totalUsd) : porCeve.OrderByDescending(c => c.totalPzs);
        return new { it.item, it.descripcion, it.totalPzs, it.totalUsd, ceves = porCeve.Take(topCeves).ToList() };
    }).ToList();

    return Results.Ok(new { categoria, resultado });
});

app.MapPost("/api/procesos/inventario-optimo/ejecutar", () =>
{
    try { return Results.Ok(EjecutarInventarioOptimo()); }
    catch (InvalidOperationException ex) { return Results.BadRequest(new { error = ex.Message }); }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});
app.MapGet("/api/procesos/inventario-optimo/ejecuciones", () => Results.Ok(LeerTabla("InventarioOptimoEjecuciones", "EjecutadoEn DESC")));
app.MapGet("/api/procesos/inventario-optimo/resultados", (string? fecha) =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    if (string.IsNullOrWhiteSpace(fecha))
    {
        cmd.CommandText = "SELECT * FROM InventarioOptimoResultados ORDER BY Fecha_venta DESC, SCCode, ItemOrg LIMIT 500";
    }
    else
    {
        cmd.CommandText = "SELECT * FROM InventarioOptimoResultados WHERE Fecha_venta = $f ORDER BY SCCode, ItemOrg";
        cmd.Parameters.AddWithValue("$f", fecha);
    }
    using var dr = cmd.ExecuteReader();
    var rows = new List<Dictionary<string, object?>>();
    while (dr.Read())
    {
        var row = new Dictionary<string, object?>();
        for (int i = 0; i < dr.FieldCount; i++) row[dr.GetName(i)] = dr.IsDBNull(i) ? null : dr.GetValue(i);
        rows.Add(row);
    }
    return Results.Ok(rows);
});

app.MapPost("/api/datos/recargar", () => Results.Ok(RecargarTodo().Select(r => new { r.Ok, r.Mensaje, r.Filas })));

app.MapGet("/api/datos/estado", () =>
{
    using var conn = new SqliteConnection(connStr);
    conn.Open();
    using var cmd = conn.CreateCommand();
    cmd.CommandText = "SELECT Fuente, Archivo, Filas, CargadoEn FROM CargasLog ORDER BY Fuente";
    using var dr = cmd.ExecuteReader();
    var rows = new List<object>();
    while (dr.Read())
        rows.Add(new { fuente = dr.GetString(0), archivo = dr.GetString(1), filas = dr.GetInt64(2), cargadoEn = dr.GetString(3) });
    return Results.Ok(new { datosDir, dbPath, fuentes = rows });
});

// Abre, en el explorador de archivos del sistema, la carpeta de Datos/
// donde va cada CSV — para que el usuario no tenga que ir navegando a
// mano. Solo abre carpetas dentro de Datos/ (nunca fuera), y las crea
// si todavía no existen (p.ej. la primera vez que se visita esa pantalla).
app.MapPost("/api/datos/abrir-carpeta", (string carpeta) =>
{
    var destino = Path.GetFullPath(Path.Combine(datosDir, carpeta ?? ""));
    var raizNormalizada = Path.GetFullPath(datosDir) + Path.DirectorySeparatorChar;
    if (!destino.StartsWith(raizNormalizada, StringComparison.Ordinal) && destino != Path.GetFullPath(datosDir))
        return Results.BadRequest(new { error = "Ruta inválida." });

    Directory.CreateDirectory(destino);
    try
    {
        // Rutas completas en vez de depender de PATH — un proceso lanzado
        // con nohup/disown (como el lanzador de Mac) no siempre hereda el
        // mismo PATH que una sesión interactiva normal.
        if (OperatingSystem.IsWindows())
            Process.Start(new ProcessStartInfo("explorer.exe", $"\"{destino}\"") { UseShellExecute = true });
        else if (OperatingSystem.IsMacOS())
            Process.Start(new ProcessStartInfo("/usr/bin/open", new[] { destino }) { UseShellExecute = false });
        else
            Process.Start(new ProcessStartInfo("/usr/bin/xdg-open", new[] { destino }) { UseShellExecute = false });
        return Results.Ok(new { ok = true, carpeta = destino });
    }
    catch (Exception ex) { return Results.Problem(ex.Message); }
});

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

var url = "http://127.0.0.1:5255";
try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { /* el usuario puede abrirlo a mano */ }

app.Run();

readonly record struct ResultadoCarga(bool Ok, string Mensaje, int Filas);
record FillRateRequest(string FechaInicio, string FechaFin);
record ExistenciaTeoricaRequest(string FechaSel, string? BaseExistencia);
record PostMortemRequest(string FechaVenta);

record CrFila(
    string Ceve, string CeveNombre, string Region, string Fecha, string NombreDia, int? Semana, string Item,
    string Desc, string Categoria, string Marca, string Canal, decimal? Cupo, decimal? Precio,
    decimal? PedidoPzs, decimal? PedidoUsd, decimal? CargoPzs, decimal? CargoUsd,
    decimal? CargoSinAumentoPzs, decimal? CargoSinAumentoUsd, decimal? RecortePzs, decimal? RecorteUsd);

sealed class PmRow
{
    public decimal InventarioOptimo;
    public string?[] FechaTransito = new string?[6];
    public decimal[] PedidoFabrica = new decimal[6];
    public decimal[] EmbarqueReal = new decimal[6];
    public decimal[] CargoReal = new decimal[6];
    public decimal[] CargoPromedio = new decimal[6];
}

sealed class CrReadRow
{
    public string CodigoCeve = ""; public string? Ceve; public string? Region; public string Fecha = "";
    public string? NombreDia; public string Item = ""; public string? Descripcion; public int? Cupo;
    public decimal? Precio; public string? Categoria; public string? Marca; public string? Canal;
    public decimal RecortePzs; public decimal RecorteUsd; public string? CausaPrincipal; public string? CausaSecundaria;
    public string? Resumen; public decimal? EnvsPlanta; public decimal? EnvsConsumo; public decimal? ExistenciaPzs;
}
