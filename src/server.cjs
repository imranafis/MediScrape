const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

// Initialize Google Generative AI
const apiKey = "AIzaSyD3gqq1uwMeun7Uejn_qLLBXeGso18wDjA"; // Replace with your actual API key
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// Express app setup
const app = express();
const port = 5000;

app.use(
  cors({
    origin: "https://imranafis.github.io", // Update frontend URL
    methods: ["POST"],
  })
);

const upload = multer({ dest: "uploads/" });

async function uploadToGemini(filePath, mimeType) {
  try {
    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType,
      displayName: path.basename(filePath),
    });
    return uploadResult.file;
  } catch (error) {
    console.error("Error uploading file to Gemini:", error);
    throw error;
  }
}

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const promptMsg = `You are an expert medical prescription data extractor and calculator. Your task is to accurately extract and process information from handwritten prescription images.

1. **Doctor's Name:** Identify and extract the doctor's name if clearly present. If not found, return "Not Found".
2. **Disease/Diagnosis:** Identify and extract any disease or condition mentioned. If not found, return "Not Found".
3. **Medical Tests:** Identify and extract any prescribed medical tests (e.g., "Blood Test", "X-ray"). If not found, return "Not Found".
4. **Medicine Names and Dosages:**
   - Extract each medicine name and its dosage, ensuring the format is "<Medicine Name> <Number> mg".
   - Validate dosages. If a dosage is invalid or unclear, return only the medicine name without a dosage.
   - If dosage is in different unit like "ml", "gm" extract it as well.
5. **Medicine Quantities and Durations:**
   - Extract the exact quantity and duration instructions as written (e.g., "1+0+1", "1/2", "১ মাস", "2 weeks", "চলবে").
   - Handle dosage frequencies (e.g., "1+0+1", "0+0+1/2", "1+1+1") by calculating the daily total.
   - Treat fractions (e.g., "1/2") as decimals (e.g., 0.5).
   - Interpret durations:
     - "১ মাস" or "1 month" = 30 days
     - "১ সপ্তাহ" or "1 week" = 7 days
     - "১0 দিন" or "10 days" = 10 days
   - If quantity is not explicitly stated, return "Quantity Not Found".
6. **Total Pieces Calculation:**
   - Multiply the daily dosage total by the duration (in days) to calculate the total pieces for each medicine.
   - **When a fraction like "1/2" is present in the dosage frequency, treat it as 0.5 and include it in the daily dosage calculation.**
   - If no duration is provided but there are "continue" instructions, only provide the daily dosage and note the instruction.
   - If quantity is "Quantity Not Found" do not attempt to calculate the total piece.
   - **Example:** If the dosage is "1+0+1/2" and the duration is "10 days", calculate the daily dosage as 1 + 0 + 0.5 = 1.5. Then, calculate the total pieces as 1.5 * 10 = 15 pieces.

7. **Accuracy and Validation:**
   - Correct misspellings and misreads by cross-referencing with medical databases.
   - Do not fabricate information. Only extract what is explicitly present.
   - If any data is ambigious return "Not Found"
8. **Output Format:**
   - Use the following structured format:

     Doctor: [Doctor's Name]
     Disease: [Disease Name]
     Medicines:
     1. [Medicine Name] [Number] mg ([Total Pieces] Pieces [Additional Instructions])
     2. [Medicine Name] [Number] mg ([Total Pieces] Pieces)
     3. [Medicine Name] [Number] mg (Quantity Not Found)
     Tests:
     1. [Test Name]

Guidelines:
- Ensure accuracy by carefully checking for discrepancies.
- Perform all calculations directly.
- Pay close attention to fractions, dosage frequencies, and duration units.
- Only output the requested information.
- If any information is missing or unclear, return "Not Found" for that specific field.
- Do not use bold formatting.
- If dosage is in different unit like "ml", "gm" extract it as well.
`;

app.post("/MediScrape", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const uploadedFile = await uploadToGemini(req.file.path, req.file.mimetype);

    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: uploadedFile.uri } },
            { text: promptMsg },
          ],
        },
      ],
    });
    const result = await chatSession.sendMessage(
      "Analyze the uploaded image and extract doctor's name, disease, medicines, and tests. Perform all dosage calculations."
    );
    const responseText = result.response.text();

    const doctorMatch = responseText.match(/Doctor:\s*(.*)/);
    const doctorName = doctorMatch ? doctorMatch[1].trim() : "Not Found";

    const diseaseMatch = responseText.match(/Disease:\s*(.*)/);
    const disease = diseaseMatch ? diseaseMatch[1].trim() : "Not Found";

    const medicines =
      responseText
        .split("Medicines:")[1]
        ?.split("Tests:")[0]
        ?.trim()
        .split("\n")
        .filter((line) => /^\d+\.\s/.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, "").trim()) || [];

    const tests =
      responseText
        .split("Tests:")[1]
        ?.trim()
        .split("\n")
        .filter((line) => /^\d+\.\s/.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, "").trim()) || [];

    fs.unlinkSync(req.file.path);

    res.json({ doctorName, disease, medicines, tests });
  } catch (error) {
    console.error("Error processing the image:", error);
    res.status(500).json({ error: "Failed to process the image." });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
