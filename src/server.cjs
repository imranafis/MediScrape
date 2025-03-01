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

    1. Extract Doctor's Name: Identify and extract the name of the doctor if it is present and clearly mentioned on the prescription.
    2. Extract Medicine Names: Precisely extract text from the uploaded handwritten prescription image, focusing only on medicine names.
    3. Extract Medical Tests: Identify any medical tests prescribed in the prescription (e.g., "Blood Test", "X-ray", "MRI", "CBC").
    4. Extract Disease/Diagnosis Names: Identify any disease or condition mentioned in the prescription (e.g., "Diabetes", "Hypertension", "Asthma").
    5. Verify Against Medical Databases: Cross-check each extracted name (medicine, test, disease) against a reliable database for accuracy.
    6. Correct Misspellings and Misreads: Identify and correct any errors caused by handwriting issues.
    7. Avoid Fabrication: Do not infer or fabricate any names or information not explicitly visible in the prescription.
    8. Extract the medicine dosage information from the given image, focusing specifically on text containing the medicine name followed by a numerical dosage value (e.g., "Indomet 25 mg"). Ensure the format is <Medicine Name> <Number> mg. Validate the dosage for correctness, and if it is invalid, return only the medicine name without the dosage.
    9. Extract all medicine names, their dosages, and the exact quantity as written in the prescription.
    10. Calculate the total number of pieces of each medicine based on the dosage instructions. If the dosage is in Bangla (e.g., "১ মাস", "২ সপ্তাহ"), convert it to the total number of pieces needed. Assume:
        - ১ মাস = 30 pieces
        - ১ সপ্তাহ = 7 pieces
        - ১0 দিন = 10 pieces
        - If the dosage includes frequencies like "1+0+1", calculate the daily total and multiply by the duration.
        - If the quantity cannot be determined, indicate "Quantity Not Found".
    11. Output Format: Provide the verified information in the following format, including the calculated total pieces:

    Doctor: [Doctor's Name]
    Disease: [Disease Name]
    Medicines:
    1. [<Medicine Name> <Number> mg (<Total Pieces> Pieces and any additional instruction)]
    2. [<Medicine Name> <Number> mg (<Total Pieces> Pieces)]
    3. [<Medicine Name> <Number> mg (<Total Pieces> Pieces Continue)]
    4. [<Medicine Name> <Number> mg (Quantity Not Found)]
    Tests:
    1. [<Test Name>]

    Guidelines:
        - Ensure accuracy by carefully checking for discrepancies in spelling or validity.
        - Perform all calculations directly within the response.
        - Only output the verified information and nothing else.
        - Please do not give output results in bold and no error message if something is missing return not found.
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
