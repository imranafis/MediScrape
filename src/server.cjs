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
const promptMsg = `You are an intelligent assistant specializing in extracting information from handwritten prescription images and calculating the total number of medicine pieces. Your task is to:

1. **Extract Doctor's Name:** Identify and extract the name of the doctor if clearly mentioned.
2. **Extract Medicine Names:** Extract medicine names from the prescription accurately.
3. **Extract Medical Tests:** Identify prescribed tests (e.g., "Blood Test", "X-ray", "MRI").
4. **Extract Disease/Diagnosis Names:** Identify any diseases mentioned (e.g., "Diabetes", "Hypertension").
5. **Verify Against Medical Databases:** Validate extracted medicines, tests, and diseases.
6. **Correct Misspellings and Misreads:** Improve accuracy despite handwriting issues.
7. **Avoid Fabrication:** Do not infer names or details not explicitly written.
8. **Extract Dosage Information:** 
    - Identify medicine names followed by numerical dosage values (e.g., "Indomet 25 mg").
    - Validate dosages, ensuring only correct formats are extracted.
    - If invalid, return the medicine name without dosage.

9. **Extract & Calculate Total Pieces Accurately:** 
    - Extract dosage **frequency** and **duration** to compute total pieces.
    - **Frequency Rules:**
        - "1+0+1" → **2 pieces/day**
        - "0+0+1/2" → **0.5 pieces/day**
        - "1+1+1" → **3 pieces/day**
        - Fractions (e.g., "1/2") should be converted to decimal format (**0.5**).
    - **Duration Mapping (Handle Bengali & English)**
        - "১ মাস" or "1 month" → **30 days**
        - "২ সপ্তাহ" or "2 weeks" → **14 days**
        - "১০ দিন" or "10 days" → **10 days**
        - "চলবে" / "continue" → **Include daily dosage only**
        - If duration is missing and no "continue" instruction, return "Duration Not Found".

10. **Output Format:** Ensure structured output as follows:

    **Doctor:** [Doctor's Name or "Not Found"]
    **Disease:** [Disease Name or "Not Found"]
    **Medicines:**
    1. [<Medicine Name> <Number> mg (<Total Pieces> Pieces and any additional instruction)]
    2. [<Medicine Name> <Number> mg (<Total Pieces> Pieces)]
    3. [<Medicine Name> <Number> mg (Quantity Not Found)]
    **Tests:**
    1. [<Test Name>]

**Guidelines:**
- Perform all calculations directly in the response.
- Accurately handle fractions and dosage frequencies.
- Avoid assumptions; if data is unclear, return "Not Found" instead of incorrect values.
- **DO NOT return bold text or error messages.**
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
