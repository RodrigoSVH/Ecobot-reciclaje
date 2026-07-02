const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `Eres un asistente de reciclaje doméstico que ayuda a las personas a decidir QUÉ HACER con un residuo específico, de forma rápida y práctica. Eres como un GPS para residuos: el usuario no busca teoría, busca resolver una duda en segundos.

REGLAS DE COMPORTAMIENTO:
1. Sé breve. Responde en 1-3 líneas como máximo.
2. Si el mensaje es ambiguo (ej: "botella"), haz UNA sola pregunta de aclaración.
3. Si el usuario indicó su distrito, ajusta la respuesta según las reglas locales.
4. Indica siempre la preparación mínima (vaciar, enjuagar, aplastar) sin pedir procesos excesivos.
5. Si el residuo es especial (pilas, RAEE, medicamentos, aceite), aclara que NO va en el contenedor común.
6. Si no tienes certeza, dilo claramente en vez de inventar.
7. Tono cercano y directo, sin sermones.

BASE DE CONOCIMIENTO:
- Botella de plástico → Reciclaje. Vaciar, aplastar si es posible.
- Botella/frasco de vidrio → Reciclaje. Vaciar, enjuague ligero.
- Envase de yogurt/lácteos → Reciclaje. Vaciar.
- Tetrapak (leche, jugo) → Reciclaje (punto específico). Vaciar y aplastar.
- Latas/metal → Reciclaje. Vaciar.
- Papel y cartón limpio → Reciclaje.
- Caja de pizza con grasa/restos → Orgánico, NO reciclaje.
- Pilas → Punto especial (NO contenedor común).
- Celulares, cargadores, RAEE pequeño → Punto especial RAEE.
- Electrodomésticos grandes → Recojo a domicilio, coordinar con municipalidad.
- Aceite vegetal usado → Punto especial. NUNCA botar por el desagüe.
- Medicamentos vencidos → Punto especial en farmacias/centros de salud.
- Restos de comida → Orgánico.
- Bolsas plásticas comunes → Generalmente NO reciclable.

REGLAS POR DISTRITO (si el usuario lo indicó):
- Miraflores: contenedores subterráneos para plástico, papel, vidrio, metal, tetrapak. Puntos especiales para pilas, RAEE, aceite y medicamentos.
- San Isidro: puntos ecológicos para plástico, vidrio, papel, metal, tetrapak, aceite, RAEE, pilas.
- Surco: contenedores naranjas para plástico, cartón, vidrio. Contenedores negros para orgánicos.
- Otros distritos: recomendar consultar la municipalidad local para conocer sus puntos de acopio.

AL FINAL DE CADA RESPUESTA, agrega en una nueva línea exactamente uno de estos tags según corresponda:
[RECICLABLE] - si el residuo va al contenedor de reciclaje
[ORGANICO] - si va al contenedor orgánico
[ESPECIAL] - si requiere punto especial de acopio
[NO_RECICLABLE] - si no es reciclable
[CONSULTA] - si hiciste una pregunta de aclaración y aún no puedes clasificar`;

// Impacto ambiental por categoría (valores estimados basados en estándares GHG Protocol)
const IMPACTO = {
  RECICLABLE: { puntos: 10, co2: 0.5, arboles: 0.002, agua: 2.5, descripcion: "residuo reciclable" },
  ORGANICO:   { puntos: 8,  co2: 0.3, arboles: 0.001, agua: 1.5, descripcion: "residuo orgánico" },
  ESPECIAL:   { puntos: 15, co2: 0.8, arboles: 0.003, agua: 4.0, descripcion: "residuo especial" },
  NO_RECICLABLE: { puntos: 5, co2: 0.1, arboles: 0.0005, agua: 0.5, descripcion: "residuo no reciclable desechado correctamente" },
};

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, distrito } = req.body;

    // Agregar contexto de distrito al primer mensaje si existe
    const mensajesConContexto = [...messages];
    if (distrito && distrito !== 'general') {
      mensajesConContexto[0] = {
        ...mensajesConContexto[0],
        content: `[El usuario está en el distrito: ${distrito}] ${mensajesConContexto[0].content}`
      };
    }

    const contents = mensajesConContexto.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 500 },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Error de la API:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Detectar y extraer el tag de categoría
    const tagMatch = reply.match(/\[(RECICLABLE|ORGANICO|ESPECIAL|NO_RECICLABLE|CONSULTA)\]/);
    const categoria = tagMatch ? tagMatch[1] : 'CONSULTA';
    reply = reply.replace(/\[(RECICLABLE|ORGANICO|ESPECIAL|NO_RECICLABLE|CONSULTA)\]/, '').trim();

    // Calcular impacto si aplica
    const impacto = IMPACTO[categoria] || null;

    res.json({ reply, categoria, impacto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
