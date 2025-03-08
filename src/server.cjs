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

const promptMsg = `You are an expert medical prescription analyst. Your task is to extract and process information from handwritten prescription images with high accuracy, especially concerning medicine dosages and quantities.

**Instructions:**

1.  **Doctor's Name:** Extract the doctor's name if clearly present. If not found, return "Not Found".
2.  **Disease/Diagnosis:** Identify and extract any diagnosed diseases or conditions. If not found, return "Not Found".
3.  **Medicine Names and Dosages:**
    * Extract each medicine's name and its numerical dosage (e.g., "Indomet 25 mg").
    * Validate the dosage. If invalid or unclear, return only the medicine name.
4.  **Medicine Quantities and Durations:**
    * Extract dosage instructions, including frequencies (e.g., "1+0+1", "0+0+1/2") and durations (e.g., "১ মাস", "২ সপ্তাহ", "10 days", "1 month", "2 weeks").
    * Convert fractions to decimals (e.g., "1/2" to 0.5).
    * Calculate the total number of medicine pieces based on the following:
        * Daily dosage: Sum the frequencies (e.g., "1+0+1" = 2, "0+0+1/2" = 0.5).
        * Duration:
            * "১ মাস" = 30 days
            * "১ সপ্তাহ" or "1 week" = 7 days
            * "২ সপ্তাহ" or "2 weeks" = 14 days
            * "১0 দিন" or "10 days" = 10 days
            * Multiply the daily dosage by the duration in days.
        * If the prescription contains words like "চলবে", "continue", or "মাথাব্যথা হলে" and does not have a duration, only return the daily dosage and the instruction.
        * If the quantity cannot be determined, return "Quantity Not Found".
5.  **Medical Tests:** Extract the names of any prescribed medical tests (e.g., "Blood Test", "X-ray"). If not found, return "Not Found".
6.  **Verification and Correction:**
    * Cross-reference extracted information with medical databases for accuracy.
    * Correct misspellings and misreads caused by handwriting.
    * Do not fabricate information. Only include what is explicitly present.
7.  **Output Format:**
    Doctor: [Doctor's Name]
    Disease: [Disease Name]
    Medicines:
    1. [Medicine Name] [Dosage] mg ([Total Pieces] Pieces [Additional Instructions])
    2. [Medicine Name] [Dosage] mg ([Total Pieces] Pieces)
    3. [Medicine Name] [Dosage] mg ([Daily Dosage] Pieces Continue)
    4. [Medicine Name] [Dosage] mg (Quantity Not Found)
    Tests:
    1. [Test Name]

**Important Considerations:**

* Focus on precise calculations for dosage and quantity.
* Handle fractions and frequencies accurately.
* Clearly differentiate between duration based calculations and "continue" based calculations.
* Return "Not Found" when information is absent.
* Do not return any bold text.
* Only return the requested data.
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
