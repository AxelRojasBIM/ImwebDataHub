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

List<ResultadoCarga> RecargarTodo() => new() {
    CargarCeves(), CargarProductosHub(), CargarRtmProductos(), CargarCalendario(),
    CargarCatCevesOracle(), CargarCatOracleFacilities(), CargarPlantasCedis(),
};

RecargarTodo();

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
