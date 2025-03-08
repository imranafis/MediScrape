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

    1. Extract Doctor's Name: Identify and extract the name of the doctor if present.
    2. Extract Medicine Names: Extract only medicine names.
    3. Extract Medical Tests: Identify prescribed tests (e.g., "Blood Test", "X-ray").
    4. Extract Disease/Diagnosis Names: Identify any disease or condition (e.g., "Diabetes").
    5. Verify Against Medical Databases: Cross-check names against a database for accuracy.
    6. Correct Misspellings: Fix errors caused by handwriting issues.
    7. Avoid Fabrication: Do not infer any names not explicitly visible.
    8. Extract the medicine dosage information from the given image, focusing specifically on text containing the medicine name followed by a numerical dosage value (e.g., "Indomet 25 mg"). Ensure the format is <Medicine Name> <Number> mg.
      - Validate the extracted dosage against a list of standard dosages from internet (Like: 0.25 mg, 0.5 mg, 1 mg, 2 mg, 2.5 mg, 5 mg, 10 mg, 20 mg, 25 mg, 50 mg, 100 mg, 250 mg, 500 mg, 1000 mg).
      - If the extracted dosage is not in the list, correct it to the closest valid dosage.
      - If no valid correction is found, return only the medicine name without the dosage.
      - Ensure no fabricated dosages are generated; if a dosage is unclear due to handwriting issues, remove it instead of assuming an incorrect value.
    9. Extract Medicine Quantities and Calculate Total Pieces:
        - Interpret dosage instructions correctly:
          - "1+0+1" → 2 per day
          - "0+0+1/2" → 0.5 per day
          - "1+1+1/2" → 2.5 per day
        - Convert fractions (e.g., "1/2" → 0.5).
        - Determine duration from instructions:
          - "১ মাস" = 30 days
          - "২ সপ্তাহ" = 14 days
          - "১০ দিন" = 10 days
          - If mixed formats exist (e.g., "২ সপ্তাহ ৩ দিন"), convert correctly.
        - Multiply daily dosage by duration.
        - If duration is missing but words like "চলবে", "continue" appear, only show the daily dosage.
        - If quantity cannot be determined, return "Quantity Not Found".
    10. Output Format:
    
    Doctor: [Doctor's Name]
    Disease: [Disease Name]
    Medicines:
    1. [<Medicine Name> <Dosage> mg (<Total Pieces> Pieces and any additional instruction)]
    2. [<Medicine Name> <Dosage> mg (<Total Pieces> Pieces)]
    3. [<Medicine Name> <Dosage> mg (Quantity Not Found)]
    Tests:
    1. [<Test Name>]

    Guidelines:
    - Ensure accuracy by verifying against valid medical databases.
    - Perform all calculations directly in the response.
    - Handle fractions, dosage frequencies, and mixed durations correctly.
    - Do not return output in bold.
    - If any information is missing, return "Not Found" instead of an error message.
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
