import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 
const ESIOS_TOKEN = process.env.ESIOS_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function recolectarPreciosDeManana() {
    const hoy = new Date();
    const mañana = new Date(hoy);
    mañana.setDate(hoy.getDate() + 0); // Mantén +0 para probar HOY; cambia a +1 para producción
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
            // FIJACIÓN HORARIA: Cortamos el texto de la fecha (ej: "14:00") para evitar el desfase del servidor
            const horaLocal = parseInt(v.datetime.substring(11, 13), 10);
            
            if (horaLocal >= 0 && horaLocal < 24) {
                const precioKWh = v.value / 1000; // Pasamos de €/MWh a €/kWh
                array24Precios[horaLocal] = Math.round(precioKWh * 100000) / 100000;
            }
        });

        console.log("📊 Precios horarios reales alineados con España:", array24Precios);

        const { error } = await supabase
            .from('tarifas_diarias')
            .upsert({ fecha: fechaStr, precios: array24Precios });

        if (error) throw error;
        console.log(`✅ ¡Éxito! Tarifas reales sincronizadas en Supabase.`);

    } catch (err) {
        console.error("❌ Proceso abortado:", err.message);
        process.exit(1);
    }
}

recolectarPreciosDeManana();
