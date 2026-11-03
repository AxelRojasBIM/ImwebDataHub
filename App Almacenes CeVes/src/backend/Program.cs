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
            Latitud TEXT, Longitud TEXT, CeveSinergia TEXT, TurnoLaboral TEXT
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
        CREATE TABLE IF NOT EXISTS RtmProductos (
            ProductId TEXT, ProductCode TEXT, ProductGlobalCode TEXT, ProductFullDesc TEXT, ProductShortDesc TEXT,
            CompanyCode TEXT, CompanyName TEXT, BrandCode TEXT, BrandName TEXT, CategoryCode TEXT, CategoryName TEXT,
            SegmentCode TEXT, SegmentName TEXT, LineCode TEXT, LineName TEXT, BaseUom TEXT, PrimarySalesUom TEXT,
            Weight TEXT, Pack1Size TEXT, Pack2Size TEXT, PiecePrice TEXT, ProductBarCode TEXT, Sequence TEXT,
            IsSalable TEXT, IsReturnable TEXT, TrayCode TEXT, ClaveProd TEXT, ClaveUnidad TEXT, ShelfLife TEXT,
            ReturnRate TEXT, BasePriceSalesCenter TEXT, UnitMeasure TEXT, Mrp TEXT, Instance TEXT, Active TEXT
        );
        CREATE TABLE IF NOT EXISTS CalendarioBimbo (
            Fecha TEXT PRIMARY KEY, Semana TEXT, Anio TEXT, Dia TEXT
        );
        CREATE TABLE IF NOT EXISTS CatCevesOracle (
            CeveCPT TEXT, Bd TEXT, Ceve TEXT, Region TEXT, Piloto TEXT, Organizacion TEXT
        );
        CREATE TABLE IF NOT EXISTS CatOracleDestFacility (
            HW TEXT, Sigla TEXT, Planta TEXT, Nombre TEXT, Sigla2 TEXT
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
            CodCeve TEXT, Item TEXT, Dia TEXT, PromedioFinalPedido REAL, DesviacionStdPedido REAL
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
             Latitud, Longitud, CeveSinergia, TurnoLaboral)
        VALUES ($cod,$nombre,$region,$org,$area,$ger,$cger,$sub,$csub,$coord,$ccoord,$dir,$lat,$lon,$sin,$turno)
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

    for (int i = 1; i < lines.Length; i++)
    {
        var vals = SplitCsvLine(lines[i]);
        string Val(string col) { var j = idx[col]; return j >= 0 && j < vals.Length ? vals[j] : ""; }
        if (string.IsNullOrWhiteSpace(Val("Cod_ceve"))) continue;

        foreach (var (col, param) in pmap) ins.Parameters[param]!.Value = Val(col);
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

ResultadoCarga CargarRtmProductos() => CargarCatalogoGenerico("Productos RTM", "RtmProductos", "Catalogos/ProductosHubPedidos/RTM", new (string, string)[] {
    ("Product_Id","ProductId"), ("Product_code","ProductCode"), ("Product_Global_Code","ProductGlobalCode"),
    ("Product_Full_Desc","ProductFullDesc"), ("Product_Short_Desc","ProductShortDesc"), ("Company_Code","CompanyCode"),
    ("Company_Name","CompanyName"), ("Brand_Code","BrandCode"), ("Brand_Name","BrandName"), ("Category_Code","CategoryCode"),
    ("Category_Name","CategoryName"), ("Segment_Code","SegmentCode"), ("Segment_Name","SegmentName"), ("Line_Code","LineCode"),
    ("Line_Name","LineName"), ("Base_Uom","BaseUom"), ("PrimarySalesUOM","PrimarySalesUom"), ("Weight","Weight"),
    ("Pack1_Size","Pack1Size"), ("Pack2_Size","Pack2Size"), ("Piece_Price","PiecePrice"), ("Product_BarCode","ProductBarCode"),
    ("Sequence","Sequence"), ("IsSalable","IsSalable"), ("IsReturnable","IsReturnable"), ("Tray_Code","TrayCode"),
    ("Clave_Prod","ClaveProd"), ("Clave_Unidad","ClaveUnidad"), ("Shelf_Life","ShelfLife"), ("Return_Rate","ReturnRate"),
    ("Base_Price_Sales_Center","BasePriceSalesCenter"), ("Unit_Measure","UnitMeasure"), ("MRP","Mrp"),
    ("Instance","Instance"), ("Active","Active"),
});

ResultadoCarga CargarCalendario() => CargarCatalogoGenerico("Calendario", "CalendarioBimbo", "Catalogos/Calendario", new (string, string)[] {
    ("Fecha","Fecha"), ("Semana","Semana"), ("Año","Anio"), ("Día","Dia"),
}, transformar: (sql, raw) => sql == "Fecha" ? FechaDmyAIso(raw) : raw);

ResultadoCarga CargarCatCevesOracle() => CargarCatalogoGenerico("Catálogo CeVes Oracle", "CatCevesOracle", "Catalogos/CatalogosOracle/CeVes", new (string, string)[] {
    ("Ceve CPT","CeveCPT"), ("Bd","Bd"), ("Ceve","Ceve"), ("Región","Region"), ("Piloto","Piloto"), ("Organización","Organizacion"),
});

ResultadoCarga CargarCatOracleFacilities() => CargarCatalogoGenerico("Catálogo Destination Facility Oracle", "CatOracleDestFacility", "Catalogos/CatalogosOracle/Facilities", new (string, string)[] {
    ("HW","HW"), ("SIGLA","Sigla"), ("Planta","Planta"), ("Nombre","Nombre"), ("SIGLA (col E)","Sigla2"),
});

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
    (string sql, Func<string, object?> parse)[] columnas)
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
    foreach (var archivo in archivos)
    {
        var lines = File.ReadAllLines(archivo).Where(l => !string.IsNullOrWhiteSpace(l)).ToArray();
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

    using (var log = conn.CreateCommand())
    {
        log.CommandText = "INSERT OR REPLACE INTO CargasLog (Fuente, Archivo, Filas, CargadoEn) VALUES ($f,$a,$n,$c)";
        log.Parameters.AddWithValue("$f", fuente);
        log.Parameters.AddWithValue("$a", string.Join(", ", archivosOk));
        log.Parameters.AddWithValue("$n", totalFilas);
        log.Parameters.AddWithValue("$c", DateTime.UtcNow.ToString("o"));
        log.ExecuteNonQuery();
    }

    return new ResultadoCarga(true, $"{archivosOk.Count} archivo(s) procesados, {totalFilas:N0} filas en {fuente}.", totalFilas);
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
});

ResultadoCarga CargarPedidoVsCargoReal() => CargarTransaccionalPorFecha("PedidoVSCargo Real", "PedidoVsCargoReal", "Cargas/PedidoVsCargoReal", 0, new (string, Func<string, object?>)[] {
    ("FechaVenta", s => { var v = NormalizarFechaIso(s); return v.Length > 0 ? (object)v : ""; }),
    ("CodCeve", ParseTxt), ("Item", ParseTxt), ("CargoPzs", ParseNum), ("PedidoPzs", ParseNum),
});

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
    ("Cod_CeVe","CodCeve"), ("Item","Item"), ("Dia","Dia"), ("PromedioFinalPedido","PromedioFinalPedido"), ("DesviacionStdPedido","DesviacionStdPedido"),
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
    CargarCeves(), CargarProductosHub(), CargarRtmProductos(), CargarCalendario(),
    CargarCatCevesOracle(), CargarCatOracleFacilities(), CargarPlantasCedis(),
    CargarPedidoCevePlanta(), CargarPedidoOracle(), CargarExistenciaCeveManual(),
    CargarPedidoVsCargoReal(), CargarParticipacionTipoMovimiento(),
    CargarCatCadenaSupministro(), CargarRemisiones(),
    CargarPedidoVendedorPromedios(), CargarFrecuenciasConsolidadas(), CargarInventarioResumen(),
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

// ── App web ──────────────────────────────────────────────────────────────
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://127.0.0.1:5255");
var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

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
app.MapGet("/api/catalogos/rtm", () => Results.Ok(LeerTabla("RtmProductos", "ProductCode")));
app.MapGet("/api/catalogos/calendario", () => Results.Ok(LeerTabla("CalendarioBimbo", "Fecha")));
app.MapGet("/api/catalogos/oracle-ceves", () => Results.Ok(LeerTabla("CatCevesOracle", "CeveCPT")));
app.MapGet("/api/catalogos/oracle-facilities", () => Results.Ok(LeerTabla("CatOracleDestFacility", "HW")));
app.MapGet("/api/catalogos/plantas", () => Results.Ok(LeerTabla("CatPlantasCedis", "Planta")));

app.MapGet("/api/cargas/pedido-ceve-planta", () => Results.Ok(LeerTabla("PedidosCevePlanta", "FechaVenta DESC")));
app.MapGet("/api/cargas/pedido-oracle", () => Results.Ok(LeerTabla("PedidosOracle", "RequiredShipDate DESC")));
app.MapGet("/api/cargas/existencia-ceve-manual", () => Results.Ok(LeerTabla("ExistenciaCeveManual", "FechaVenta DESC")));
app.MapGet("/api/cargas/pedido-vs-cargo-real", () => Results.Ok(LeerTabla("PedidoVsCargoReal", "FechaVenta DESC")));
app.MapGet("/api/cargas/participacion-tipo-movimiento", () => Results.Ok(LeerTabla("ParticipacionTipoMovimiento", "CodigoCeve")));
app.MapGet("/api/catalogos/cadena-suministro", () => Results.Ok(LeerTabla("CatCadenaSupministro", "CodCeve")));
app.MapGet("/api/cargas/remisiones", () => Results.Ok(LeerTabla("RemisionesProductosCEQ", "FechaVenta DESC")));

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

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

var url = "http://127.0.0.1:5255";
try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { /* el usuario puede abrirlo a mano */ }

app.Run();

readonly record struct ResultadoCarga(bool Ok, string Mensaje, int Filas);
record FillRateRequest(string FechaInicio, string FechaFin);
record ExistenciaTeoricaRequest(string FechaSel, string? BaseExistencia);
