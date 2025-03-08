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

1. **Extract Doctor's Name:** Identify and extract the doctor's name if clearly mentioned.
2. **Extract Medicine Names:** Extract only medicine names from the handwritten prescription.
3. **Extract Medical Tests:** Identify any prescribed medical tests (e.g., "Blood Test", "X-ray").
4. **Extract Disease/Diagnosis Names:** Identify any mentioned diseases (e.g., "Diabetes", "Hypertension").
5. **Verify Against Medical Databases:** Cross-check extracted names (medicine, test, disease) for accuracy.
6. **Correct Misspellings and Misreads:** Ensure correct interpretation of handwriting.
7. **Avoid Fabrication:** Do not infer or fabricate any names or information.
8. **Extract Dosage Information:** Extract medicine names with numerical dosage values in "<Medicine Name> <Number> mg" format. If the dosage is unclear, return only the medicine name.
9. **Extract and Calculate Medicine Quantities:**
    - Identify dosage patterns like "1+0+1" (2 per day), "0+0+½" (0.5 per day), or "1+1+1" (3 per day).
    - Convert fractional values accurately (e.g., "1/2" → 0.5, "½" → 0.5).
    - Extract **duration** from phrases like:
        - "১ মাস" / "1 month" → 30 days
        - "২ সপ্তাহ" / "2 weeks" → 14 days
        - "১০ দিন" / "10 days" → 10 days
    - Multiply the **daily total dosage** by the duration.
    - If **no duration is mentioned**, check for words like "চলবে" / "continue" and return only the daily dosage with the instruction.
    - If the quantity is unclear, return "Quantity Not Found".
10. **Output Format:**
    - Doctor: [Doctor's Name]
    - Disease: [Disease Name]
    - Medicines:
      1. [<Medicine Name> <Number> mg (<Total Pieces> Pieces and any additional instruction)]
      2. [<Medicine Name> <Number> mg (<Total Pieces> Pieces)]
      3. [<Medicine Name> <Number> mg (<Total Pieces> Pieces Continue)]
      4. [<Medicine Name> <Number> mg (Quantity Not Found)]
    - Tests:
      1. [<Test Name>]

**Guidelines:**
- Ensure accuracy by checking spelling and validity.
- Perform all calculations directly within the response.
- Properly interpret dosage frequencies and durations.
- Do not fabricate missing details; return "Not Found" when necessary.
- Output only verified information, without formatting (no bold or unnecessary text).
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
