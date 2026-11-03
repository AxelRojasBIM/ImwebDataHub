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

List<ResultadoCarga> RecargarTodo() => new() { CargarCeves() };

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
