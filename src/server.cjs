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

const promptMsg = `You are an expert medical prescription data extraction and calculation assistant. Your task is to accurately process handwritten prescription images and provide structured information.

1.  **Doctor's Name:** Extract the doctor's name if present and clearly legible. If not found, return "Not Found".
2.  **Disease/Diagnosis:** Extract any disease or condition mentioned. If not found, return "Not Found".
3.  **Medical Tests:** Extract prescribed medical tests (e.g., "Blood Test", "X-ray"). If not found, return "Not Found".
4.  **Medicine Names and Dosages:**
    * Precisely extract each medicine name.
    * Extract the dosage (e.g., "25 mg", "500 mcg").
    * Ensure the format is "<Medicine Name> <Number> <unit>".
    * Validate the dosage unit (mg, mcg, ml, etc.). If invalid, return only the medicine name and "Dosage Invalid".
5.  **Dosage Frequency and Duration:**
    * Extract dosage frequencies (e.g., "1+0+1", "0+0+1/2", "1+1+1").
    * Extract duration if provided (e.g., "১ মাস", "২ সপ্তাহ", "10 days", "1 month", "2 weeks").
    * Handle phrases like "চলবে", "মাথাব্যথা হলে", "continue", indicating ongoing use.
6.  **Total Pieces Calculation:**
    * Calculate the daily dosage total based on the frequency.
    * Treat fractions (e.g., "1/2") as decimals (0.5).
    * If a duration is given:
        * "১ মাস" = 30 days
        * "১ সপ্তাহ" = 7 days
        * "10 দিন" = 10 days
        * Multiply the daily total by the duration.
    * If "চলবে", "মাথাব্যথা হলে", or "continue" are present, include the daily total and the phrase.
    * If quantity cannot be determined return "Quantity Not Found".
7.  **Verification and Correction:**
    * Cross-reference medicine names, dosages, and tests against medical databases to verify accuracy.
    * Correct misspellings and misreads caused by handwriting.
    * Do not fabricate information. Only extract what is explicitly present.
8.  **Output Format:**
    * Doctor: [Doctor's Name] or Not Found
    * Disease: [Disease Name] or Not Found
    * Medicines:
        1.  [<Medicine Name> <Number> <unit> (<Total Pieces> Pieces) or (<Total Pieces> Pieces Continue) or (Quantity Not Found) or (Dosage Invalid)]
        2.  [<Medicine Name> <Number> <unit> (<Total Pieces> Pieces)]
        3.  ...
    * Tests:
        1.  [<Test Name>] or Not Found
        2.  ...

**Guidelines:**

* Prioritize accuracy in extraction and calculations.
* Handle variations in handwriting and terminology.
* Do not provide bold output.
* Return "Not Found" rather than error messages.
* Clearly distinguish between dosage units (mg, mcg, ml etc.).
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
