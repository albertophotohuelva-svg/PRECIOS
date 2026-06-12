import { createClient } from '@supabase/supabase-js';

// Recogemos las credenciales ocultas de forma segura del sistema
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const ESIOS_TOKEN = process.env.ESIOS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function recolectarPreciosDeManana() {
    const hoy = new Date();
    const mañana = new Date(hoy);
    mañana.setDate(hoy.getDate() + 0); // Lo dejamos en +0 para actualizar HOY con los precios reales
    const fechaStr = mañana.toISOString().split('T')[0];

    console.log(`🤖 Iniciando descarga para la fecha: ${fechaStr}...`);

    const url = `https://api.esios.ree.es/indicators/1001?start_date=${fechaStr}T00:00&end_date=${fechaStr}T23:59`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json; application/vnd.esios-api-v1+json',
                'Content-Type': 'application/json',
                'x-api-key': ESIOS_TOKEN,
                'Authorization': `Token token="${ESIOS_TOKEN}"`
            }
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const resData = await response.json();
        const valoresHorarios = resData.indicator?.values;

        if (!valoresHorarios || valoresHorarios.length === 0) {
            throw new Error("Red Eléctrica aún no ha publicado los precios.");
        }

        const array24Precios = new Array(24).fill(0);
        valoresHorarios.forEach(v => {
            const hora = new Date(v.datetime).getHours();
            
            // CORRECCIÓN: Convertimos de €/MWh a €/kWh (dividiendo entre 1000) y dejamos 5 decimales limpios
            const precioKWh = v.value / 1000;
            array24Precios[hora] = Math.round(precioKWh * 100000) / 100000;
        });

        console.log("📊 Precios reales procesados:", array24Precios);

        const { error } = await supabase
            .from('tarifas_diarias')
            .upsert({ fecha: fechaStr, precios: array24Precios });

        if (error) throw error;
        console.log(`✅ ¡Éxito! Tarifas reales guardadas en Supabase.`);

    } catch (err) {
        console.error("❌ Proceso abortado:", err.message);
        process.exit(1);
    }
}

recolectarPreciosDeManana();
