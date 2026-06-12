import { createClient } from '@supabase/supabase-js';

// Recogemos las credenciales ocultas de forma segura del sistema
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Usa el Service Role para tener permisos de escritura
const ESIOS_TOKEN = process.env.ESIOS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function recolectarPreciosDeManana() {
    // 1. Calculamos la fecha de mañana en zona horaria española
    const hoy = new Date();
    const mañana = new Date(hoy);
    mañana.setDate(hoy.getDate() + 0);
    const fechaStr = mañana.toISOString().split('T')[0]; // Devuelve YYYY-MM-DD

    console.log(`🤖 Iniciando descarga para la fecha: ${fechaStr}...`);

    // 2. URL del indicador 1001 (Término de facturación PVPC / Energía XXI)
    const url = `https://api.esios.ree.es/indicators/1001?start_date=${fechaStr}T00:00&end_date=${fechaStr}T23:59`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json; application/vnd.esios-api-v1+json',
                'Content-Type': 'application/json',
                'x-api-key': ESIOS_TOKEN,
                'Authorization': `Token token="${ESIOS_TOKEN}"` // Doble seguridad según tu tipo de cuenta esios
            }
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const resData = await response.json();
        const valoresHorarios = resData.indicator?.values;

        if (!valoresHorarios || valoresHorarios.length === 0) {
            throw new Error("Red Eléctrica aún no ha publicado los precios de mañana (recuerda que salen a partir de las 20:30).");
        }

        // 3. Creamos el array de 24 horas y lo rellenamos
        const array24Precios = new Array(24).fill(0);
        valoresHorarios.forEach(v => {
            const hora = new Date(v.datetime).getHours();
            // Convertimos de €/MWh a €/kWh (dividiendo por 1000)
            array24Precios[hora] = Math.round((v.value / 1000) * 15) / 15 || v.value / 1000;
        });

        console.log("📊 Precios procesados correctamente:", array24Precios);

        // 4. Subida estricta a Supabase
        const { error } = await supabase
            .from('tarifas_diarias')
            .upsert({ fecha: fechaStr, precios: array24Precios });

        if (error) throw error;
        console.log(`✅ ¡Éxito! Tarifas de Colón 1 para el día ${fechaStr} guardadas en la nube.`);

    } catch (err) {
        console.error("❌ Proceso abortado:", err.message);
        process.exit(1); // Avisa a GitHub de que el script falló
    }
}

recolectarPreciosDeManana();
