import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize GoogleGenAI SDK
// API key is pulled fromprocess.env.GEMINI_API_KEY
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json());

// API route for healthcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// API endpoint for AI Copilot in PDV
app.post("/api/pdv/copilot", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "O texto para processamento é obrigatório." });
    }

    const prompt = `Você é um assistente de vendas inteligente no PDV. Analise a seguinte mensagem falada ou digitada pelo vendedor e filtre os itens solicitados estruturadamente. Mapeie os itens detalhadamente tentando deduzir o termo de pesquisa mais provável de existir no estoque (exemplo: "duas camisa do flamengo" -> pesquisa: "camisa flamengo", quant: 2). Se um cliente for mencionado, extraia seu nome e WhatsApp se houver.

Texto de entrada: "${text}"`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          description: "Lista de itens extraídos do texto",
          items: {
            type: Type.OBJECT,
            properties: {
              productSearch: { 
                type: Type.STRING,
                description: "Termo de busca do produto purificado (ex: 'Flamengo Oficial 2024' ou 'Calça Jeans')"
              },
              quantity: { 
                type: Type.INTEGER,
                description: "Quantidade solicitada (padrão 1 caso oculto)"
              }
            },
            required: ["productSearch", "quantity"]
          }
        },
        customerName: { 
          type: Type.STRING,
          description: "Nome do cliente se mencionado, caso contrário nulo ou vazio"
        },
        customerWhatsapp: { 
          type: Type.STRING,
          description: "Apenas números do WhatsApp do cliente se mencionado"
        },
        notes: {
          type: Type.STRING,
          description: "Qualquer observação adicional sobre o pedido trazido pelo texto"
        }
      },
      required: ["items"]
    };

    // Retry and Fallback models strategy to handle highly loaded or temporarily unavailable models (like 503 errors)
    // We prioritize gemini-flash-latest for high speed and reliable rate-limits.
    const modelsToTry = ["gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
    let lastError: any = null;
    let resultText = "";

    for (const model of modelsToTry) {
      let retries = 1; // 1 retry per model is faster to fail-over to the next available model
      let delay = 500; // start with a short delay for lower latency

      while (retries >= 0) {
        try {
          console.log(`[Copilot Engine] Processando requisicao com: ${model} (${retries} tentativas)...`);
          const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: responseSchema,
            }
          });

          if (response && response.text) {
            resultText = response.text;
            break; // Success! Break out of retry loop
          }
          throw new Error("Modelo retornou resposta vazia.");
        } catch (err: any) {
          lastError = err;
          const errorMsg = String(err.message || "").toLowerCase();
          const isTemporary = errorMsg.includes("503") || 
                              errorMsg.includes("unavailable") || 
                              errorMsg.includes("limit") || 
                              errorMsg.includes("demand") ||
                              errorMsg.includes("busy") ||
                              errorMsg.includes("overloaded") ||
                              errorMsg.includes("resource_exhausted");

          if (isTemporary && retries > 0) {
            console.log(`[Copilot Engine] Ajuste de conexao temporario com ${model}. Redirecionando tentativa em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            retries--;
            delay *= 2; // Exponential backoff
          } else {
            console.log(`[Copilot Engine] Mudando de ${model} para proximo modelo disponivel.`);
            break; // Stop retrying this model, proceed with the next model in modelsToTry
          }
        }
      }

      if (resultText) {
        break; // If we completed successfully with a model, stop trying back-ups
      }
    }

    if (!resultText) {
      throw lastError || new Error("Todos os canais de IA estao instaveis no momento. Por favor tente novamente.");
    }

    const parsedData = JSON.parse(resultText.trim());
    res.json(parsedData);
  } catch (error: any) {
    console.error("Erro no PDV Copilot API:", error);
    res.status(500).json({ error: error.message || "Erro interno ao processar inteligência artificial." });
  }
});

// Mount Vite server in development
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      base: "/erp-clubdabola/"
    });
    app.use(vite.middlewares);

    // Redirect / to /erp-clubdabola/ for developer convenience
    app.get("/", (req, res) => {
      res.redirect("/erp-clubdabola/");
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use('/erp-clubdabola', express.static(distPath));
    
    app.get('/erp-clubdabola/*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });

    app.get("/", (req, res) => {
      res.redirect("/erp-clubdabola/");
    });
  }
}

setupVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error("Failed to start Vite middleware server:", err);
});
