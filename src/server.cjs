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
const promptMsg = `You are an intelligent assistant specializing in extracting information from handwritten prescription images. Your task is to:

Extraction Requirements:
1. Extract Doctor's Name - Identify and extract the doctor's name if clearly mentioned in the prescription.
2. Extract Disease/Diagnosis Names - Identify any disease or condition mentioned in the prescription (e.g., "Diabetes", "Hypertension", "Asthma").
3. Extract Medical Tests - Identify any medical tests prescribed in the prescription (e.g., "Blood Test", "X-ray", "MRI", "CBC").
4. Extract Medicine Names & Dosage - Precisely extract all medicine names along with their dosage (mg) as written in the prescription.
5. Calculate Total Tablets/Pieces Needed:
   - If the dosage and duration are given, calculate the total number of pieces needed.
   - Recognize dosage patterns such as "1+0+1" (morning & night), "1+1+1" (three times a day), or fractional doses like "½".
   - Interpret dosage instructions written in Bangla.
   - Handle different duration units:
     - "মাস" (month) → Multiply daily dosage by 30
     - "সপ্তাহ" (week) → Multiply daily dosage by 7
     - "দিন" (day) → Use given day count
     - "চলবে" (continue) → Return "Continue" without total quantity calculation
   - Convert fractional dosages:
     - "1/2" or "½" → Count as 0.5 when calculating total pieces.
   - If total quantity cannot be determined, return "Quantity Not Found".

### Output Format:
Doctor: [Doctor's Name]
Disease: [Disease Name]
Medicines:
1. [Medicine Name] [Dosage] mg ([Total Pieces] Pieces)
2. [Medicine Name] [Dosage] mg (Continue)
3. [Medicine Name] [Dosage] mg (Quantity Not Found)
Tests:
1. [Test Name]

### Guidelines:
- Extract and validate all names against medical databases to ensure accuracy.
- Correct misreads caused by handwriting issues.
- Do not** infer or fabricate any details that are not explicitly present in the prescription.
- If an instruction is present next to dosage or duration, include it in parentheses.
- If the exact quantity is **already written in the prescription**, use that value instead of recalculating.
- **Do not return bold or formatted text in the response.**`;

console.log(promptMsg);

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
      "Analyze the uploaded image and extract doctor's name, disease, medicines, and tests."
    );
    const responseText = result.response.text();

    const doctorMatch = responseText.match(/Doctor:\s*(.*)/);
    const doctorName = doctorMatch ? doctorMatch[1].trim() : "Not Found";

    const diseaseMatch = responseText.match(/Disease:\s*(.*)/);
    const disease = diseaseMatch ? diseaseMatch[1].trim() : "Not Found";

    const medicines = responseText
      .split("Medicines:\n")[1]
      .split("Tests:\n")[0]
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.replace(/^\d+\.\s*/, "").trim());

    const testsMatch = responseText.match(/Tests:\s*([\s\S]*)/);
    const tests = testsMatch
      ? testsMatch[1]
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      : [];

    fs.unlinkSync(req.file.path);

    res.json({ doctorName, disease, medicines, tests });
  } catch (error) {
    console.error("Error processing the image:", error);
    res.status(500).json({ error: "Failed to process the image." });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
