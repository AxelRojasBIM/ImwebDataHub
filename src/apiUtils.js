const API = 'https://imweb-api-gwd3fgesgherh0b2.canadacentral-01.azurewebsites.net'

// Despierta la API si está dormida (Azure App Service free tier duerme tras 20 min)
// Reintenta automáticamente hasta maxRetries veces con delay entre intentos
export async function fetchWithRetry(url, options = {}, { maxRetries = 2, delayMs = 4000, onWaking } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      return res
    } catch (err) {
      if (attempt === maxRetries) throw err
      // La API está dormida — avisamos y esperamos
      if (onWaking) onWaking(attempt + 1)
      // Intentar despertar con health check
      try { await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(10_000) }) } catch {}
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}
