#!/usr/bin/env bash
# Genera la carpeta "publish/" lista para entregar: build de Windows y Mac
# autocontenidos (no requieren .NET instalado), más un lanzador de un clic
# para cada sistema y la carpeta Datos/ vacía con la misma estructura que
# usa el proyecto en desarrollo. Todo lo que hay que copiarle al usuario
# final está dentro de "publish/" al terminar.
set -euo pipefail
cd "$(dirname "$0")"

DOTNET="dotnet"
command -v dotnet >/dev/null 2>&1 || DOTNET="$HOME/.dotnet/dotnet"

RAIZ="$(pwd)"
PUBLISH="$RAIZ/publish"

# Por si quedó un datos.db de una corrida de prueba anterior (p.ej.
# probando el lanzador a mano) — nunca debe ir dentro del paquete que se
# entrega, porque ya no sería un primer arranque limpio.
rm -f "$PUBLISH/datos.db"

echo "── Frontend ──────────────────────────────────────────────"
(cd src/frontend && npm install --no-fund --no-audit && npm run build)

echo "── Backend: Windows (win-x64) ────────────────────────────"
rm -rf "$PUBLISH/win-x64"
"$DOTNET" publish src/backend/Backend.csproj -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
  -o "$PUBLISH/win-x64"

echo "── Backend: Mac (osx-arm64) ──────────────────────────────"
rm -rf "$PUBLISH/osx-arm64"
"$DOTNET" publish src/backend/Backend.csproj -c Release -r osx-arm64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true \
  -o "$PUBLISH/osx-arm64"
chmod +x "$PUBLISH/osx-arm64/AppAlmacenesCeVes"

echo "── Carpeta Datos/ con catálogos reales ───────────────────"
# Se reconstruye desde cero cada vez (nada de arrastrar restos de
# corridas anteriores). Misma estructura que Datos/ en desarrollo, con
# los extractos de producción ya descargados. Los que
# CargarTransaccionalPorFecha ya movió a _Procesados/ (Remisiones,
# Inventario Resumen) se copian desde ahí hacia su carpeta original,
# para que el build publicado los cargue solo al arrancar por primera
# vez (RecargarTodo corre al inicio).
rm -rf "$PUBLISH/Datos"
find Datos -type d ! -path "*/_Procesados*" | while read -r d; do
  mkdir -p "$PUBLISH/${d}"
done

find Datos -name "*.csv" | while read -r f; do
  rel="${f#Datos/}"
  rel="${rel#_Procesados/}"
  destino="$PUBLISH/Datos/$rel"
  mkdir -p "$(dirname "$destino")"
  cp "$f" "$destino"
  echo "  $rel"
done

echo "── Lanzadores de un clic ─────────────────────────────────"
cat > "$PUBLISH/Iniciar en Windows.bat" <<'EOF'
@echo off
start "" "%~dp0win-x64\AppAlmacenesCeVes.exe"
EOF

cat > "$PUBLISH/Iniciar en Mac.command" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")/osx-arm64"
./AppAlmacenesCeVes
EOF
chmod +x "$PUBLISH/Iniciar en Mac.command"

cat > "$PUBLISH/LEEME.txt" <<'EOF'
App Almacenes CeVes — primer arranque
======================================

Windows: doble clic en "Iniciar en Windows.bat"
Mac:     doble clic en "Iniciar en Mac.command"

Se abre sola una ventana del navegador en http://localhost:5255 — no hace
falta tener nada más instalado.

Los catálogos (CeVes, Productos, Calendario, etc.) ya vienen cargados.
Lo que falta son las cargas del día a día (Pedido CeVe a Planta/Cedis,
PedidoVSCargo Real, etc.): deposita el CSV en la carpeta que te pida
cada pantalla dentro de Datos/, y da clic en "Recargar datos" (arriba a
la derecha).

Esta carpeta es autosuficiente: cópiala completa a donde quieras (otra
PC, USB, etc.) y sigue funcionando igual. No hace falta nada de fuera
de ella.

No borres ni muevas las carpetas "win-x64" / "osx-arm64" ni el archivo
"datos.db" que aparece después del primer arranque — ahí vive toda la
información cargada.
EOF

echo
echo "Listo. Para entregar: copia o comprime la carpeta completa"
echo "  $PUBLISH"
echo "No hay nada más que compartir — es autosuficiente."
